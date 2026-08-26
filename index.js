import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  delay,
  DisconnectReason,
  Browsers
} from '@whiskeysockets/baileys';
import pino from 'pino';
import NodeCache from 'node-cache';
import QRCode from 'qrcode';
import firebaseSync from './firebaseSync.js';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Discord OAuth Configuration
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || `http://localhost:${PORT}/api/auth/discord/callback`;
const VERCEL_FRONTEND_URL = process.env.VERCEL_FRONTEND_URL || 'http://localhost:3000'; // Update this when deploying to Vercel

// ─────────────────────────────────────────────────────────────────
// ACCESS CODE PROTECTION
// Set ACCESS_CODE environment variable to change the secret code
// Default code: SKYBEE2026
// ─────────────────────────────────────────────────────────────────
const ACCESS_CODE = process.env.ACCESS_CODE || 'SKYBEE2026';

function requireAccessCode(req, res, next) {
  const provided = req.headers['x-access-code'] ||
                   req.query.accessCode ||
                   req.body?.accessCode;
  if (!provided) {
    return res.status(401).json({ error: 'Access code required. Set X-Access-Code header or accessCode param.' });
  }
  if (String(provided).trim() !== ACCESS_CODE) {
    console.warn(`[SECURITY] Invalid access code attempt from ${req.ip} — provided: "${provided}"`);
    return res.status(403).json({ error: 'Invalid access code. Access denied.' });
  }
  next();
}

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1') || origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────────────
// BASE DIRECTORIES & GLOBAL STATE
// ─────────────────────────────────────────────────────────────────
const tempSessionsDir = path.join(__dirname, 'temp_sessions');
if (!fs.existsSync(tempSessionsDir)) {
  fs.mkdirSync(tempSessionsDir, { recursive: true });
}

const multiSessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(multiSessionsDir)) {
  fs.mkdirSync(multiSessionsDir, { recursive: true });
}

const BOT_DIR   = path.join(__dirname, 'CypherX', 'CypherX-main');
const BOT_ENTRY = path.join(BOT_DIR, 'bot-engine.js');

// Multi-session active pairing sockets & retry cache
const activePairSockets = new Map();
const qrSessions = new Map();
const msgRetryCounterCache = new NodeCache();

// ─────────────────────────────────────────────────────────────────
// SESSION ID HELPERS (ENCODE, DECODE, SEND PROMPTS, RESTORE)
// ─────────────────────────────────────────────────────────────────

// Generate portable base64 session string from creds.json in a directory
function getSessionIdForDir(dirPath) {
  try {
    const credsPath = path.join(dirPath, 'creds.json');
    if (fs.existsSync(credsPath)) {
      const data = fs.readFileSync(credsPath, 'utf8');
      return 'SKYBEE~' + Buffer.from(data.trim()).toString('base64');
    }
  } catch (e) {
    console.warn('[SESSION ID] Error generating session string:', e.message);
  }
  return null;
}

// Generate portable base64 session string for a given phone number
function getSessionIdForPhone(phone) {
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  const dirPath = path.join(multiSessionsDir, cleanPhone);
  return getSessionIdForDir(dirPath);
}

// Prompt and deliver the Session ID directly to WhatsApp chat upon linking
async function sendSessionIdPrompt(sock, userJid, phone, sessionId) {
  if (!sock || !userJid || !sessionId) return;
  try {
    // 1. Send detailed instruction prompt
    await sock.sendMessage(userJid, {
      text: `🐝 *SKYBEE BOT LINKED & CONNECTED!* 🐝\n\n` +
            `📱 *Phone:* +${phone}\n` +
            `☁️ *Status:* Active & Hosted 24/7 on Skybee Cloud\n\n` +
            `🔑 *YOUR RECOVERY SESSION ID:*\n` +
            `Please *SAVE* your Session ID below! If the bot crashes, sleeps, or the server/website restarts, you can paste this Session ID on the website under *"Paste Session ID"* to reconnect instantly without linking or scanning again.\n\n` +
            `👇 *Your Session ID is sent in the next message for 1-tap copy:*`
    });

    await delay(1000);

    // 2. Send standalone Session ID for 1-tap easy copying on WhatsApp mobile
    await sock.sendMessage(userJid, {
      text: sessionId
    });

    await delay(1000);

    // 3. Send Quick start command instructions
    await sock.sendMessage(userJid, {
      text: `🤖 *Ready to use!* Type *.menu* to view 544+ commands or *.ping* to test speed.`
    });
  } catch (err) {
    console.warn(`[SESSION PROMPT NOTE] +${phone}:`, err.message);
  }
}

// Process and restore a bot instance from a pasted Session ID
async function processSessionConnection(sessionIdInput, rawPhone = '') {
  if (!sessionIdInput || typeof sessionIdInput !== 'string') {
    throw new Error('Session ID string is required.');
  }

  let base64 = sessionIdInput.trim();
  if (base64.includes('~')) {
    base64 = base64.split('~')[1];
  } else if (base64.startsWith('SESSION_')) {
    base64 = base64.replace('SESSION_', '');
  }

  let credsJson;
  try {
    const decoded = Buffer.from(base64.trim(), 'base64').toString('utf-8');
    credsJson = JSON.parse(decoded);
  } catch {
    // Fallback: test if input itself is already raw JSON
    try {
      credsJson = JSON.parse(sessionIdInput.trim());
    } catch {
      throw new Error('Invalid Session ID format. Please make sure you copied the complete SKYBEE~... session string.');
    }
  }

  if (!credsJson || typeof credsJson !== 'object') {
    throw new Error('Corrupted or invalid credentials in Session ID.');
  }

  // Determine phone number from creds or input
  let phone = rawPhone ? String(rawPhone).replace(/[^0-9]/g, '') : '';
  if (!phone && credsJson.me?.id) {
    phone = credsJson.me.id.split(':')[0].replace(/[^0-9]/g, '');
  }
  if (!phone && credsJson.creds?.me?.id) {
    phone = credsJson.creds.me.id.split(':')[0].replace(/[^0-9]/g, '');
  }
  if (!phone) {
    phone = `user_${Date.now()}`;
  }

  const userSessionDir = path.join(multiSessionsDir, phone);
  if (fs.existsSync(userSessionDir)) {
    // Clean old files while preserving directory
    try {
      const files = fs.readdirSync(userSessionDir);
      for (const f of files) {
        fs.rmSync(path.join(userSessionDir, f), { recursive: true, force: true });
      }
    } catch {}
  } else {
    fs.mkdirSync(userSessionDir, { recursive: true });
  }

  fs.writeFileSync(path.join(userSessionDir, 'creds.json'), JSON.stringify(credsJson, null, 2));

  console.log(`[CONNECT SESSION] Restored credentials for +${phone} from Session ID`);

  // Sync to database vault and Firebase
  await firebaseSync.saveSessionToCloud(phone, userSessionDir, 'pending').catch(() => {});

  // Start bot engine
  const bot = botManager.startBot(phone);

  const finalSessionId = `SKYBEE~` + Buffer.from(JSON.stringify(credsJson)).toString('base64');

  return {
    phone,
    bot,
    sessionId: finalSessionId
  };
}

// ─────────────────────────────────────────────────────────────────
// MULTI-TENANT BOT MANAGER
// Manages multiple independent WhatsApp Bot child processes
// ─────────────────────────────────────────────────────────────────
class MultiBotManager {
  constructor() {
    this.bots = new Map(); // phone -> { phone, process, status, logs, startedAt, sessionDir }
    this.manualStops = new Set(); // tracks bots explicitly stopped by user so they don't auto-restart
    this.serverStartedAt = new Date();
    this.ensureDirs();
  }

  ensureDirs() {
    if (!fs.existsSync(multiSessionsDir)) fs.mkdirSync(multiSessionsDir, { recursive: true });
    if (!fs.existsSync(tempSessionsDir)) fs.mkdirSync(tempSessionsDir, { recursive: true });
  }

  getOrCreate(phone, sessionDir) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    if (!this.bots.has(cleanPhone)) {
      this.bots.set(cleanPhone, {
        phone: cleanPhone,
        process: null,
        status: 'stopped',
        logs: [],
        startedAt: null,
        sessionDir: sessionDir || path.join(multiSessionsDir, cleanPhone)
      });
    }
    return this.bots.get(cleanPhone);
  }

  appendLog(phone, line) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    const bot = this.getOrCreate(cleanPhone);
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `[${timestamp}] ${line}`;
    bot.logs.push(formatted);
    if (bot.logs.length > 100) bot.logs.shift();
    process.stdout.write(`[BOT ${cleanPhone}] ${line}\n`);
  }

  startBot(phone) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    const sessionDir = path.join(multiSessionsDir, cleanPhone);
    const credsPath = path.join(sessionDir, 'creds.json');

    if (!fs.existsSync(credsPath)) {
      throw new Error(`No credentials found for +${cleanPhone}`);
    }

    this.manualStops.delete(cleanPhone);
    const bot = this.getOrCreate(cleanPhone, sessionDir);

    // Check approval status
    const vault = firebaseSync.readLocalVault();
    const sessionData = vault.sessions[cleanPhone];
    if (sessionData && sessionData.approvalStatus === 'pending') {
      this.appendLog(cleanPhone, `Bot is PENDING ADMIN APPROVAL. Launch aborted.`);
      bot.status = 'pending';
      return bot;
    }

    if (bot.process && bot.status === 'running') {
      this.appendLog(cleanPhone, `Bot is already running (PID: ${bot.process.pid})`);
      return bot;
    }

    bot.status = 'running';
    bot.startedAt = new Date();
    this.appendLog(cleanPhone, `Starting Skybee Bot Engine for +${cleanPhone}...`);

    try {
      const proc = spawn('node', [BOT_ENTRY, '--session', sessionDir, '--phone', cleanPhone], {
        cwd: BOT_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, BOT_SESSION_DIR: sessionDir, FORCE_COLOR: '0' },
      });

      bot.process = proc;

      proc.stdout.on('data', d => {
        const text = d.toString().trim();
        if (text) this.appendLog(cleanPhone, text);
      });

      proc.stderr.on('data', d => {
        const text = d.toString().trim();
        if (text) this.appendLog(cleanPhone, `ERR: ${text}`);
      });

      proc.on('exit', (code, signal) => {
        bot.process = null;
        if (this.manualStops.has(cleanPhone)) {
          bot.status = 'stopped';
          this.appendLog(cleanPhone, `Bot stopped by user.`);
        } else {
          bot.status = 'reconnecting';
          this.appendLog(cleanPhone, `Bot process disconnected (code=${code}). Supervisor auto-restarting in 5s...`);
          setTimeout(() => {
            if (!this.manualStops.has(cleanPhone) && fs.existsSync(path.join(sessionDir, 'creds.json'))) {
              try {
                this.startBot(cleanPhone);
              } catch (e) {
                console.error(`[SUPERVISOR RESTART] +${cleanPhone}:`, e.message);
              }
            }
          }, 5000);
        }
      });

      proc.on('error', (err) => {
        bot.process = null;
        bot.status = 'error';
        this.appendLog(cleanPhone, `Process error: ${err.message}`);
        if (!this.manualStops.has(cleanPhone)) {
          setTimeout(() => {
            if (!this.manualStops.has(cleanPhone)) {
              try { this.startBot(cleanPhone); } catch {}
            }
          }, 8000);
        }
      });

      return bot;
    } catch (err) {
      bot.status = 'error';
      this.appendLog(cleanPhone, `Startup error: ${err.message}`);
      throw err;
    }
  }

  stopBot(phone) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    this.manualStops.add(cleanPhone);
    const bot = this.bots.get(cleanPhone);
    if (!bot || !bot.process) {
      if (bot) bot.status = 'stopped';
      return;
    }

    try {
      bot.process.kill('SIGTERM');
    } catch {}
    bot.process = null;
    bot.status = 'stopped';
    this.appendLog(cleanPhone, 'Bot stopped by user.');
  }

  restartBot(phone) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    this.manualStops.delete(cleanPhone);
    this.stopBot(cleanPhone);
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          this.manualStops.delete(cleanPhone);
          const b = this.startBot(cleanPhone);
          resolve(b);
        } catch (e) {
          resolve(null);
        }
      }, 1500);
    });
  }

  deleteBot(phone) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    this.manualStops.add(cleanPhone);
    this.stopBot(cleanPhone);
    const sessionDir = path.join(multiSessionsDir, cleanPhone);
    try {
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`[MANAGER] Error deleting session dir for ${cleanPhone}:`, err);
    }
    this.bots.delete(cleanPhone);
    firebaseSync.deleteSessionFromCloud(cleanPhone).catch(() => {});
  }

  // Scan sessions directory and auto-start all registered bot instances
  async initAllSessions() {
    console.log('[MANAGER] Checking Firebase Cloud & local sessions...');
    try {
      await firebaseSync.restoreSessionsFromCloud(multiSessionsDir);
    } catch (e) {
      console.log('[FIREBASE] Cloud sync note:', e.message);
    }

    if (!fs.existsSync(multiSessionsDir)) return;
    const entries = fs.readdirSync(multiSessionsDir, { withFileTypes: true });

    for (const ent of entries) {
      if (ent.isDirectory()) {
        const phone = ent.name;
        if (!phone || phone.trim() === '') continue;
        const sessionPath = path.join(multiSessionsDir, phone);
        if (fs.existsSync(path.join(sessionPath, 'creds.json'))) {
          console.log(`[MANAGER] Auto-loading registered session: +${phone}`);
          this.getOrCreate(phone, sessionPath);
          try {
            this.startBot(phone);
            // Backup session to Firebase
            firebaseSync.saveSessionToCloud(phone, sessionPath).catch(() => {});
          } catch (e) {
            console.error(`[MANAGER] Failed to auto-start +${phone}:`, e.message);
          }
        }
      }
    }
  }

  listBots() {
    const list = [];
    // Ensure all directories in sessions/ are reflected in the list
    if (fs.existsSync(multiSessionsDir)) {
      const dirs = fs.readdirSync(multiSessionsDir, { withFileTypes: true });
      for (const d of dirs) {
        if (d.isDirectory() && fs.existsSync(path.join(multiSessionsDir, d.name, 'creds.json'))) {
          this.getOrCreate(d.name, path.join(multiSessionsDir, d.name));
        }
      }
    }

    for (const [phone, b] of this.bots.entries()) {
      if (!phone || phone.trim() === '') continue;
      let userName = '';
      let approvalStatus = 'approved';
      try {
        const vault = firebaseSync.readLocalVault();
        const sessionData = vault.sessions[phone];
        if (sessionData && sessionData.approvalStatus) {
           approvalStatus = sessionData.approvalStatus;
        }

        const credPath = path.join(multiSessionsDir, phone, 'creds.json');
        if (fs.existsSync(credPath)) {
          const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
          userName = creds.me?.name || creds.pushName || '';
        }
      } catch {}

      list.push({
        phone: b.phone,
        name: userName,
        approvalStatus,
        status: b.status,
        startedAt: b.startedAt,
        uptime: b.startedAt && b.status === 'running' ? Math.floor((Date.now() - new Date(b.startedAt).getTime()) / 1000) : 0,
        logCount: b.logs.length,
        hasCreds: fs.existsSync(path.join(multiSessionsDir, phone, 'creds.json')),
        sessionId: getSessionIdForPhone(phone)
      });
    }
    return list;
  }
}

const botManager = new MultiBotManager();

// ─────────────────────────────────────────────────────────────────
// SESSION PAIRING HELPERS
// ─────────────────────────────────────────────────────────────────

function cleanupPairSocket(phone, sessionDir, sock) {
  try { sock?.ws?.close(); } catch {}
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  } catch {}
  activePairSockets.delete(phone);
}

// Promote temp pairing session to permanent multi-user session and launch bot
function promoteToPermanentSession(phone, sourceDir) {
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  const targetDir = path.join(multiSessionsDir, cleanPhone);

  try {
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    fs.mkdirSync(targetDir, { recursive: true });
    fs.cpSync(sourceDir, targetDir, { recursive: true });
    console.log(`[MULTI-SESSION] Saved permanent credentials to ${targetDir}`);

    // Upload session to Firebase Cloud with pending status (add discordId if available from req)
    // Note: To properly link it, we'd pass the discordId from the pairing request here,
    // but for now we rely on the session being saved.
    firebaseSync.saveSessionToCloud(cleanPhone, targetDir, 'pending').catch(() => {});

    console.log(`[MULTI-SESSION] Ready for independent bot deployment for +${cleanPhone}`);

    return targetDir;
  } catch (err) {
    console.error(`[MULTI-SESSION] Error promoting session for +${cleanPhone}:`, err);
    throw err;
  }
}

async function startPairSocket(phone, sessionDir) {
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    msgRetryCounterCache,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 25000,
  });

  activePairSockets.set(phone, { sock, sessionDir });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log(`[PAIR LINKED] Successfully connected WhatsApp for +${phone}`);
      try {
        await delay(2500);
        const credsPath = path.join(sessionDir, 'creds.json');
        if (!fs.existsSync(credsPath)) return;

        // Save to permanent sessions and start individual bot instance
        const permDir = promoteToPermanentSession(phone, sessionDir);

        // Generate recovery Session ID
        const sessionId = getSessionIdForDir(permDir) || getSessionIdForDir(sessionDir);

        // Notify user and send Session ID prompt on WhatsApp
        try {
          const rawId = sock.user?.id || '';
          const userJid = rawId.includes(':') ? `${rawId.split(':')[0]}@s.whatsapp.net` : rawId;
          if (userJid && sessionId) {
            await sendSessionIdPrompt(sock, userJid, phone, sessionId);
          }
        } catch (sendErr) {
          console.warn('[PAIR Notify Note]:', sendErr.message);
        }
      } catch (e) {
        console.error('[ERROR] Post-pairing error:', e);
      } finally {
        await delay(3000);
        try { sock?.ws?.close(); } catch {}
        activePairSockets.delete(phone);
      }

    } else if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || 'unknown';
      console.log(`[PAIR DISCONNECTED] +${phone}, code=${code}, reason=${reason}`);

      if (code === DisconnectReason.loggedOut || code === 401) {
        console.log(`[PAIR LOGGED OUT] +${phone}`);
        cleanupPairSocket(phone, sessionDir, sock);
      } else {
        // Critical: WhatsApp drops connection temporarily during pairing to switch to registered state
        // Reconnect instead of deleting the session directory!
        if (activePairSockets.has(phone)) {
          console.log(`[PAIR RECONNECTING] Re-establishing handshake socket for +${phone}...`);
          setTimeout(() => {
            if (activePairSockets.has(phone)) {
              startPairSocket(phone, sessionDir);
            }
          }, 2000);
        }
      }
    }
  });

  return sock;
}

// ─────────────────────────────────────────────────────────────────
// DISCORD OAUTH AUTHENTICATION ENDPOINTS
// ─────────────────────────────────────────────────────────────────

app.get('/api/auth/discord', (req, res) => {
  if (!DISCORD_CLIENT_ID) {
    return res.status(500).send('Discord OAuth is not configured on the server (missing DISCORD_CLIENT_ID).');
  }
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(authUrl);
});

app.get('/api/auth/discord/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.redirect(`${VERCEL_FRONTEND_URL}?error=missing_code`);
  }

  try {
    // 1. Exchange code for access token
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: DISCORD_REDIRECT_URI
    }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const accessToken = tokenResponse.data.access_token;

    // 2. Fetch user profile from Discord
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const discordUser = userResponse.data;

    // 3. Save user to Firebase
    await firebaseSync.saveDiscordUser(discordUser);

    // 4. Redirect back to Vercel client with the user ID (in a real app, use a secure session/JWT here)
    // For simplicity in this demo, we'll just pass the discordId to the frontend
    res.redirect(`${VERCEL_FRONTEND_URL}/store.html?discordId=${discordUser.id}&username=${encodeURIComponent(discordUser.username)}`);

  } catch (error) {
    console.error('[DISCORD OAUTH ERROR]:', error.response?.data || error.message);
    res.redirect(`${VERCEL_FRONTEND_URL}?error=oauth_failed`);
  }
});

// Fetch user's bots from Firebase
app.get('/api/users/:discordId/bots', async (req, res) => {
  const { discordId } = req.params;
  const bots = await firebaseSync.getUserBots(discordId);
  res.json({ success: true, bots });
});

// ─────────────────────────────────────────────────────────────────
// PUBLIC CLIENT STORE & RECONNECTION ENDPOINTS
// ─────────────────────────────────────────────────────────────────

// Public client store & pairing page
app.get(['/store', '/pair', '/refer', '/client', '/connect', '/activate', '/link'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'store.html'));
});

// Public client pairing code endpoint
app.get('/api/client/pair-code', async (req, res) => {
  let phone = req.query.phone;
  if (!phone) return res.status(400).json({ success: false, error: 'WhatsApp phone number is required.' });

  phone = phone.replace(/[^0-9]/g, '');
  if (phone.length < 8 || phone.length > 15) {
    return res.status(400).json({ success: false, error: 'Please enter a valid phone number with country code (e.g. 233558816890).' });
  }

  console.log(`[CLIENT STORE PAIR REQUEST] Public client pairing request for +${phone}`);

  if (activePairSockets.has(phone)) {
    const old = activePairSockets.get(phone);
    cleanupPairSocket(phone, old.sessionDir, old.sock);
    await delay(1000);
  }

  const sessionDir = path.join(tempSessionsDir, `client_pair_${phone}_${Date.now()}`);

  try {
    const sock = await startPairSocket(phone, sessionDir);
    await delay(3000);

    if (!sock.authState.creds.registered) {
      let code = await sock.requestPairingCode(phone);
      code = code?.match(/.{1,4}/g)?.join('-') || code;
      console.log(`[CLIENT CODE GENERATED] +${phone} → ${code}`);

      // Auto-cleanup after 3 minutes if pairing code not entered
      setTimeout(() => {
        if (activePairSockets.has(phone)) {
          console.log(`[CLIENT TIMEOUT] Cleaning up pending pair socket for +${phone}`);
          cleanupPairSocket(phone, sessionDir, sock);
        }
      }, 180000);

      return res.json({ success: true, code, phone });
    } else {
      cleanupPairSocket(phone, sessionDir, sock);
      return res.status(400).json({ success: false, error: 'Device is already registered and linked.' });
    }
  } catch (err) {
    console.error('[ERROR] client pair-code route:', err);
    try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
    activePairSockets.delete(phone);
    return res.status(500).json({ success: false, error: 'Failed to generate pairing code. Please check your phone number and try again.' });
  }
});

// Public client bot connection status checker (Includes Session ID if linked)
app.get('/api/client/status', (req, res) => {
  let phone = req.query.phone;
  if (!phone) return res.status(400).json({ success: false, error: 'Phone number is required.' });
  phone = phone.replace(/[^0-9]/g, '');

  const bot = botManager.bots.get(phone);
  const isPairingPending = activePairSockets.has(phone);
  const sessionId = getSessionIdForPhone(phone);

  if (bot && bot.status === 'running') {
    return res.json({
      success: true,
      phone,
      status: 'active',
      sessionId: sessionId || undefined,
      message: 'Bot is online, running, and active!'
    });
  } else if (isPairingPending) {
    return res.json({
      success: true,
      phone,
      status: 'pairing',
      message: 'Waiting for pairing code confirmation in WhatsApp...'
    });
  } else if ((bot && bot.status === 'stopped') || sessionId) {
    let finalStatus = 'linked';
    let message = 'Bot is linked and ready to start.';
    const vault = firebaseSync.readLocalVault();
    if (vault.sessions && vault.sessions[phone] && vault.sessions[phone].approvalStatus === 'pending') {
       finalStatus = 'pending';
       message = 'Waiting for Admin Approval.';
    }

    return res.json({
      success: true,
      phone,
      status: finalStatus,
      sessionId: sessionId || undefined,
      message
    });
  } else if ((bot && bot.status === 'pending')) {
    return res.json({
      success: true,
      phone,
      status: 'pending',
      sessionId: sessionId || undefined,
      message: 'Waiting for Admin Approval.'
    });
  } else {
    return res.json({
      success: true,
      phone,
      status: 'linked',
      sessionId: sessionId || undefined,
      message: 'Bot is linked and ready to start.'
    });
  }
});

// Public endpoint to retrieve Session ID for a given linked phone
app.get('/api/client/session-id', (req, res) => {
  let phone = req.query.phone;
  if (!phone) return res.status(400).json({ success: false, error: 'Phone number is required.' });
  phone = phone.replace(/[^0-9]/g, '');

  const sessionId = getSessionIdForPhone(phone);
  if (!sessionId) {
    return res.status(404).json({ success: false, error: 'No active session found for this phone number.' });
  }

  return res.json({ success: true, phone, sessionId });
});

// ─────────────────────────────────────────────────────────────────
// PUBLIC CLIENT SESSION RECONNECT / INJECT
// (Paste Session ID to restore bot after crash/site restart)
// ─────────────────────────────────────────────────────────────────
app.post(['/api/client/connect-session', '/api/client/inject-session', '/api/connect-session'], async (req, res) => {
  try {
    const { sessionId, phone } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Please paste your complete SKYBEE~... Session ID.' });
    }

    const result = await processSessionConnection(sessionId, phone);

    return res.json({
      success: true,
      message: `🎉 WhatsApp Session restored successfully! Bot +${result.phone} is now online and connected.`,
      phone: result.phone,
      sessionId: result.sessionId,
      status: result.bot.status
    });
  } catch (err) {
    console.error('[CLIENT CONNECT SESSION ERROR]:', err.message);
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to restore session. Please verify your Session ID.'
    });
  }
});

// ─────────────────────────────────────────────────────────────────
// PUBLIC CLIENT BOT CONTROLS (Start, Stop, Restart, Logs, Unlink)
// ─────────────────────────────────────────────────────────────────
app.post(['/api/client/bot/start', '/api/client/start'], async (req, res) => {
  const phone = req.body?.phone || req.query.phone;
  if (!phone) return res.status(400).json({ success: false, error: 'Phone number is required.' });
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  try {
    const sessionDir = path.join(multiSessionsDir, cleanPhone);
    if (!fs.existsSync(path.join(sessionDir, 'creds.json'))) {
      // Auto-restore session from Database Vault / Firebase Cloud
      await firebaseSync.restoreSessionsFromCloud(multiSessionsDir);
    }
    if (!fs.existsSync(path.join(sessionDir, 'creds.json'))) {
      return res.status(400).json({ success: false, error: 'No saved WhatsApp session found in database for this number. Please link your bot or paste your Session ID.' });
    }
    const bot = botManager.startBot(cleanPhone);
    return res.json({ success: true, message: `Bot +${cleanPhone} is now starting and connecting...`, status: bot.status });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post(['/api/client/bot/stop', '/api/client/stop'], (req, res) => {
  const phone = req.body?.phone || req.query.phone;
  if (!phone) return res.status(400).json({ success: false, error: 'Phone number is required.' });
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  botManager.stopBot(cleanPhone);
  return res.json({ success: true, message: `Bot +${cleanPhone} stopped. Session remains saved in database for instant restart anytime!` });
});

app.post(['/api/client/bot/restart', '/api/client/restart'], async (req, res) => {
  const phone = req.body?.phone || req.query.phone;
  if (!phone) return res.status(400).json({ success: false, error: 'Phone number is required.' });
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  const sessionDir = path.join(multiSessionsDir, cleanPhone);
  if (!fs.existsSync(path.join(sessionDir, 'creds.json'))) {
    await firebaseSync.restoreSessionsFromCloud(multiSessionsDir);
  }
  const bot = await botManager.restartBot(cleanPhone);
  return res.json({ success: true, message: `Bot +${cleanPhone} restarted successfully.`, status: bot ? bot.status : 'stopped' });
});

app.get(['/api/client/bot/logs', '/api/client/logs'], (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.status(400).json({ success: false, error: 'Phone number is required.' });
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  const bot = botManager.bots.get(cleanPhone);
  if (!bot) {
    return res.status(404).json({ success: false, error: 'Bot not found.' });
  }
  return res.json({ success: true, phone: cleanPhone, status: bot.status, logs: bot.logs || [] });
});

app.post(['/api/client/bot/delete', '/api/client/delete'], (req, res) => {
  const phone = req.body?.phone || req.query.phone;
  if (!phone) return res.status(400).json({ success: false, error: 'Phone number is required.' });
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  botManager.deleteBot(cleanPhone);
  return res.json({ success: true, message: `Bot +${cleanPhone} unlinked and session removed from database.` });
});

// Public store statistics
app.get('/api/client/stats', (req, res) => {
  const bots = botManager.listBots();
  const running = bots.filter(b => b.status === 'running').length;
  return res.json({
    success: true,
    totalHosted: Math.max(bots.length, 12),
    activeBots: Math.max(running, 8),
    commandsCount: 544,
    uptimePercent: '99.9%'
  });
});

// Public endpoint: verify access code (used by admin gate)
app.post('/api/verify-access', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ success: false, error: 'No code provided.' });
  if (String(code).trim() === ACCESS_CODE) {
    console.log(`[ACCESS] Successful access code entry from ${req.ip}`);
    return res.json({ success: true });
  }
  console.warn(`[SECURITY] Failed access code attempt from ${req.ip}`);
  return res.status(403).json({ success: false, error: 'Wrong access code. Try again.' });
});

// ─────────────────────────────────────────────────────────────────
// API ROUTES: MULTI-BOT DASHBOARD & CONTROLS (ADMIN PANEL)
// ─────────────────────────────────────────────────────────────────

// List all hosted bots
app.get('/api/bots', (req, res) => {
  const bots = botManager.listBots();
  return res.json({ success: true, bots });
});

// Approve a pending bot
app.post('/api/bots/approve/:phone', async (req, res) => {
  const phone = req.params.phone.replace(/[^0-9]/g, '');
  if (!phone) return res.status(400).json({ success: false, error: 'Phone number is required.' });

  try {
    const vault = firebaseSync.readLocalVault();
    if (vault.sessions && vault.sessions[phone]) {
      vault.sessions[phone].approvalStatus = 'approved';
      firebaseSync.writeLocalVault(vault);

      // Immediately start the bot
      try {
        botManager.startBot(phone);
      } catch (e) {
        console.error(`[APPROVAL] Failed to start approved bot +${phone}:`, e.message);
      }

      return res.json({ success: true, message: `Bot +${phone} approved successfully.` });
    }
    return res.status(404).json({ success: false, error: 'Session not found.' });
  } catch (err) {
    console.error('[APPROVAL ERROR]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// System statistics
app.get('/api/system-stats', (req, res) => {
  const bots = botManager.listBots();
  const running = bots.filter(b => b.status === 'running').length;
  const stopped = bots.filter(b => b.status === 'stopped').length;
  const error = bots.filter(b => b.status === 'error').length;

  const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(1);
  const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(1);
  const usedMem = (totalMem - freeMem).toFixed(1);
  const procMemMb = (process.memoryUsage().rss / (1024 * 1024)).toFixed(0);

  return res.json({
    success: true,
    totalBots: bots.length,
    runningBots: running,
    stoppedBots: stopped,
    errorBots: error,
    uptime: Math.floor((Date.now() - (botManager.serverStartedAt ? new Date(botManager.serverStartedAt).getTime() : Date.now())) / 1000),
    botMemory: `${procMemMb} MB`,
    memory: { total: `${totalMem} GB`, used: `${usedMem} GB`, free: `${freeMem} GB` }
  });
});

// Get logs for a specific bot
app.get('/api/bots/:phone/logs', (req, res) => {
  const { phone } = req.params;
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  const bot = botManager.bots.get(cleanPhone);
  if (!bot) {
    return res.status(404).json({ success: false, error: 'Bot instance not found.' });
  }
  return res.json({
    success: true,
    phone: cleanPhone,
    status: bot.status,
    logs: bot.logs
  });
});

// Start a specific bot [PROTECTED]
app.post('/api/bots/:phone/start', requireAccessCode, (req, res) => {
  const { phone } = req.params;
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  try {
    const bot = botManager.startBot(cleanPhone);
    return res.json({ success: true, message: `Bot +${cleanPhone} started.`, status: bot.status });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// Stop a specific bot
app.post('/api/bots/:phone/stop', (req, res) => {
  const { phone } = req.params;
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  botManager.stopBot(cleanPhone);
  return res.json({ success: true, message: `Bot +${cleanPhone} stopped.` });
});

// Restart a specific bot
app.post('/api/bots/:phone/restart', async (req, res) => {
  const { phone } = req.params;
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  await botManager.restartBot(cleanPhone);
  return res.json({ success: true, message: `Bot +${cleanPhone} restarted.` });
});

// Delete & unlink a specific bot [PROTECTED]
app.delete('/api/bots/:phone', requireAccessCode, (req, res) => {
  const { phone } = req.params;
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  botManager.deleteBot(cleanPhone);
  return res.json({ success: true, message: `Bot +${cleanPhone} session unlinked and deleted.` });
});

// Route: Get pairing code [PROTECTED]
app.get('/api/pair-code', requireAccessCode, async (req, res) => {
  let phone = req.query.phone;
  if (!phone) return res.status(400).json({ error: 'Phone number is required.' });

  phone = phone.replace(/[^0-9]/g, '');
  console.log(`[PAIR REQUEST] Multi-Host pairing request for +${phone}`);

  if (activePairSockets.has(phone)) {
    const old = activePairSockets.get(phone);
    cleanupPairSocket(phone, old.sessionDir, old.sock);
    await delay(1000);
  }

  const sessionDir = path.join(tempSessionsDir, `pair_${phone}_${Date.now()}`);

  try {
    const sock = await startPairSocket(phone, sessionDir);
    await delay(3000);

    if (!sock.authState.creds.registered) {
      let code = await sock.requestPairingCode(phone);
      code = code?.match(/.{1,4}/g)?.join('-') || code;
      console.log(`[CODE GENERATED] +${phone} → ${code}`);

      // Auto-cleanup after 3 minutes if pairing code not entered
      setTimeout(() => {
        if (activePairSockets.has(phone)) {
          console.log(`[TIMEOUT] Cleaning up pending pair socket for +${phone}`);
          cleanupPairSocket(phone, sessionDir, sock);
        }
      }, 180000);

      return res.json({ success: true, code, phone });
    } else {
      cleanupPairSocket(phone, sessionDir, sock);
      return res.status(400).json({ error: 'Device is already registered.' });
    }
  } catch (err) {
    console.error('[ERROR] pair-code route:', err);
    try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
    activePairSockets.delete(phone);
    return res.status(500).json({ error: 'Failed to generate pairing code.' });
  }
});

// Route: Start QR code session (Public for clients & admin)
app.post(['/api/qr-start', '/api/client/qr-start'], async (req, res) => {
  const sessionId = 'qr_' + Date.now();
  const sessionDir = path.join(tempSessionsDir, `qr_${Date.now()}`);

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
      },
      browser: ['Ubuntu', 'Chrome', '20.0.04'],
      msgRetryCounterCache,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 120000,
      defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 25000,
    });

    qrSessions.set(sessionId, { qrDataUrl: null, linked: false, phone: null, generatedSessionId: null, sock, sessionDir, error: null });
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, qr, lastDisconnect } = update;

      if (qr) {
        try {
          const dataUrl = await QRCode.toDataURL(qr, {
            width: 280,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' }
          });
          const session = qrSessions.get(sessionId);
          if (session) {
            session.qrDataUrl = dataUrl;
            session.error = null;
          }
        } catch (e) {
          console.error('[QR] QR conversion error:', e);
        }
      }

      if (connection === 'open') {
        const rawId = sock.user?.id || '';
        const phone = rawId.split(':')[0].replace(/[^0-9]/g, '') || `user_${Date.now()}`;
        console.log(`[QR LINKED] Connected via QR for user +${phone}`);

        const session = qrSessions.get(sessionId);
        if (session) {
          session.linked = true;
          session.phone = phone;
        }

        try {
          await delay(3000);
          const permDir = promoteToPermanentSession(phone, sessionDir);
          const genSessionId = getSessionIdForDir(permDir) || getSessionIdForDir(sessionDir);

          if (session) {
            session.generatedSessionId = genSessionId;
          }

          const userJid = rawId.includes(':') ? `${rawId.split(':')[0]}@s.whatsapp.net` : rawId;
          if (userJid && genSessionId) {
            await sendSessionIdPrompt(sock, userJid, phone, genSessionId);
          }
        } catch (e) {
          console.error('[QR] Post-link save error:', e);
        } finally {
          await delay(4000);
          try { sock?.ws?.close(); } catch {}
          try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
          qrSessions.delete(sessionId);
        }

      } else if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'unknown';
        console.log(`[QR CLOSED] session=${sessionId} code=${code} reason=${reason}`);

        const session = qrSessions.get(sessionId);
        if (!session) return;

        if (code === DisconnectReason.loggedOut || code === 401) {
          session.error = 'Session expired. Please refresh and try again.';
          qrSessions.delete(sessionId);
          try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
        } else if (code === 515) {
          // 515 = Restart Required — auto-retry the QR socket once
          console.log(`[QR] Code 515 restart required for session ${sessionId}, retrying...`);
          session.error = null;
          session.qrDataUrl = null;
          try {
            sock?.ws?.close();
          } catch {}
          setTimeout(async () => {
            try {
              const newSess = qrSessions.get(sessionId);
              if (!newSess) return;
              const { state: s2, saveCreds: sc2 } = await useMultiFileAuthState(sessionDir);
              const { version: v2 } = await fetchLatestBaileysVersion();
              const sock2 = makeWASocket({
                version: v2,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                auth: s2,
                browser: Browsers.macOS('Desktop'),
                msgRetryCounterCache,
                generateHighQualityLinkPreview: false,
                syncFullHistory: false,
                markOnlineOnConnect: false,
                connectTimeoutMs: 120000,
                keepAliveIntervalMs: 15000,
              });
              newSess.sock = sock2;
              sock2.ev.on('creds.update', sc2);
              sock2.ev.on('connection.update', async (u2) => {
                if (u2.qr) {
                  try {
                    const dataUrl = await QRCode.toDataURL(u2.qr, { width: 280, margin: 2 });
                    const s = qrSessions.get(sessionId);
                    if (s) { s.qrDataUrl = dataUrl; s.error = null; }
                  } catch {}
                }
                if (u2.connection === 'open') {
                  const rawId = sock2.user?.id || '';
                  const phone2 = rawId.split(':')[0].replace(/[^0-9]/g, '') || `user_${Date.now()}`;
                  const s = qrSessions.get(sessionId);
                  if (s) { s.linked = true; s.phone = phone2; }
                  try {
                    await delay(3000);
                    const permDir = promoteToPermanentSession(phone2, sessionDir);
                    const genSessionId = getSessionIdForDir(permDir) || getSessionIdForDir(sessionDir);
                    if (s) { s.generatedSessionId = genSessionId; }
                    const userJid = rawId.includes(':') ? `${rawId.split(':')[0]}@s.whatsapp.net` : rawId;
                    if (userJid && genSessionId) {
                      await sendSessionIdPrompt(sock2, userJid, phone2, genSessionId);
                    }
                  } catch {} finally {
                    await delay(4000);
                    try { sock2?.ws?.close(); } catch {}
                    try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
                    qrSessions.delete(sessionId);
                  }
                }
              });
            } catch (retryErr) {
              console.error('[QR 515 Retry Error]:', retryErr.message);
              const s = qrSessions.get(sessionId);
              if (s) s.error = 'Connection failed. Click Refresh QR to try again.';
            }
          }, 2000);
        } else {
          if (session) session.error = `Connection closed (code ${code}). Click Refresh QR to try again.`;
        }
      }
    });

    // Auto-cleanup after 2 minutes if nobody scans
    setTimeout(() => {
      if (qrSessions.has(sessionId)) {
        const s = qrSessions.get(sessionId);
        try { s.sock?.ws?.close(); } catch {}
        try { fs.rmSync(s.sessionDir, { recursive: true, force: true }); } catch {}
        qrSessions.delete(sessionId);
      }
    }, 120000);

    return res.json({ success: true, sessionId });
  } catch (err) {
    console.error('[ERROR] qr-start route:', err);
    try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
    return res.status(500).json({ success: false, error: 'Failed to start QR session.' });
  }
});

// Route: Poll QR status
app.get('/api/qr-status', (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' });

  const session = qrSessions.get(sessionId);
  if (!session) {
    return res.json({ linked: false, qr: null, error: 'Session expired or closed.' });
  }

  return res.json({
    linked: session.linked,
    phone: session.phone,
    sessionId: session.generatedSessionId || (session.phone ? getSessionIdForPhone(session.phone) : null),
    qr: session.qrDataUrl || null,
    error: session.error || null,
  });
});

// Route: Inject Session ID directly [PROTECTED]
app.post('/api/inject-session', requireAccessCode, async (req, res) => {
  try {
    const { sessionId, phone } = req.body;
    const result = await processSessionConnection(sessionId, phone);
    return res.json({
      success: true,
      message: `Session credentials saved to Database & Cloud. Bot +${result.phone} is starting!`,
      phone: result.phone,
      sessionId: result.sessionId
    });
  } catch (err) {
    console.error('[INJECT] Error:', err);
    return res.status(500).json({ error: 'Failed to inject session: ' + err.message });
  }
});

// Health Check / Ping endpoints for Uptime monitors & KeepAlive
app.get(['/health', '/ping', '/live'], (req, res) => {
  return res.json({
    status: 'ok',
    uptime: process.uptime(),
    activeBots: botManager.listBots().filter(b => b.status === 'running').length,
    timestamp: new Date().toISOString()
  });
});

// ─────────────────────────────────────────────────────────────────
// 24/7 RENDER & CLOUD ANTI-SLEEP KEEP-ALIVE WORKER
// ─────────────────────────────────────────────────────────────────
function initKeepAliveWorker() {
  const targetUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || 'https://bot-z47t.onrender.com';
  console.log(`[KEEP-ALIVE] 24/7 Anti-Sleep Heartbeat active for: ${targetUrl}`);

  // Pulse every 3.5 minutes (well under Render 15-min idle sleep threshold)
  setInterval(async () => {
    try {
      const pingUrl = `${targetUrl}/health`;
      const res = await fetch(pingUrl, { headers: { 'User-Agent': 'SkybeeKeepAlive/2.0' } });
      if (res.ok) {
        // Success
      }
    } catch {}
  }, 3.5 * 60 * 1000);

  // Periodic Firestore backup of active sessions every 10 minutes
  setInterval(async () => {
    try {
      if (fs.existsSync(multiSessionsDir)) {
        const dirs = fs.readdirSync(multiSessionsDir, { withFileTypes: true });
        for (const d of dirs) {
          if (d.isDirectory() && fs.existsSync(path.join(multiSessionsDir, d.name, 'creds.json'))) {
            await firebaseSync.saveSessionToCloud(d.name, path.join(multiSessionsDir, d.name));
          }
        }
      }
    } catch {}
  }, 10 * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────────
// SERVER INITIALIZATION
// ─────────────────────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=================================================`);
  console.log(`🚀 SKYBEE Multi-User WhatsApp Bot Host Running!`);
  console.log(`🌐 Dashboard URL: http://localhost:${PORT}`);
  console.log(`📦 Sessions Storage: ${multiSessionsDir}`);
  console.log(`=================================================\n`);

  // Initialize and auto-boot all existing user sessions
  botManager.initAllSessions();

  // Start 24/7 Anti-Sleep worker
  initKeepAliveWorker();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] Port ${PORT} is already in use. Kill the old process first:`);
    console.error(`Windows: Stop-Process -Name node -Force  (or taskkill /F /IM node.exe)\n`);
  } else {
    console.error('[SERVER ERROR]', err);
  }
  process.exit(1);
});

// ─────────────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN (SAVE SESSIONS ON CRASH/SLEEP)
// ─────────────────────────────────────────────────────────────────
async function backupAllSessionsAndExit(code = 0) {
  console.log('[SHUTDOWN] Backing up all sessions before exit...');
  try {
    if (fs.existsSync(multiSessionsDir)) {
      const dirs = fs.readdirSync(multiSessionsDir, { withFileTypes: true });
      const promises = [];
      for (const d of dirs) {
        if (d.isDirectory() && fs.existsSync(path.join(multiSessionsDir, d.name, 'creds.json'))) {
          promises.push(firebaseSync.saveSessionToCloud(d.name, path.join(multiSessionsDir, d.name)));
        }
      }
      await Promise.all(promises);
      console.log('[SHUTDOWN] All sessions backed up successfully.');
    }
  } catch (err) {
    console.error('[SHUTDOWN] Error backing up sessions:', err);
  }
  process.exit(code);
}

process.on('SIGTERM', () => {
  console.log('Received SIGTERM (Site sleep/restart). Graceful shutdown start...');
  backupAllSessionsAndExit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT (Ctrl+C). Graceful shutdown start...');
  backupAllSessionsAndExit(0);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception (Crash):', err);
  backupAllSessionsAndExit(1);
});
