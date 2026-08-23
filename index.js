import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  delay,
  DisconnectReason,
  Browsers
} from '@whiskeysockets/baileys';
import pino from 'pino';
import NodeCache from 'node-cache';
import QRCode from 'qrcode';
import firebaseSync from './firebaseSync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────────────────────────
// ACCESS CODE PROTECTION
// Set ACCESS_CODE environment variable to change the secret code
// Default code: REDDRAGON2024
// ─────────────────────────────────────────────────────────────────
const ACCESS_CODE = process.env.ACCESS_CODE || 'REDDRAGON2024';

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

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Public client store & pairing routes
app.get(['/store', '/pair', '/refer', '/client', '/connect', '/activate', '/link'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'store.html'));
});

// Public client pairing endpoint (No admin access code required for clients)
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
    await delay(2000);

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

// Public client bot connection status checker
app.get('/api/client/status', (req, res) => {
  let phone = req.query.phone;
  if (!phone) return res.status(400).json({ success: false, error: 'Phone number is required.' });
  phone = phone.replace(/[^0-9]/g, '');

  const bot = botManager.bots.get(phone);
  const isPairingPending = activePairSockets.has(phone);

  if (bot && bot.status === 'running') {
    return res.json({
      success: true,
      phone,
      status: 'active',
      message: 'Bot is online, running, and active!'
    });
  } else if (isPairingPending) {
    return res.json({
      success: true,
      phone,
      status: 'pairing',
      message: 'Waiting for pairing code confirmation in WhatsApp...'
    });
  } else if (bot && bot.status === 'stopped') {
    return res.json({
      success: true,
      phone,
      status: 'linked',
      message: 'Bot is linked and initializing...'
    });
  } else {
    return res.json({
      success: true,
      phone,
      status: 'idle',
      message: 'Ready to pair.'
    });
  }
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

// Public endpoint: verify access code (used by frontend gate)
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

// Base directories
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
// MULTI-TENANT BOT MANAGER
// Manages multiple independent WhatsApp Bot child processes
// ─────────────────────────────────────────────────────────────────
class MultiBotManager {
  constructor() {
    /** @type {Map<string, { phone: string, process: any, status: 'running'|'stopped'|'error', logs: string[], startedAt: Date|null, sessionDir: string }>} */
    this.bots = new Map();
    this.serverStartedAt = new Date();
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

    const bot = this.getOrCreate(cleanPhone, sessionDir);
    if (bot.process && bot.status === 'running') {
      this.appendLog(cleanPhone, `Bot is already running (PID: ${bot.process.pid})`);
      return bot;
    }

    bot.status = 'running';
    bot.startedAt = new Date();
    this.appendLog(cleanPhone, `Starting CypherX Bot Engine for +${cleanPhone}...`);

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
        bot.status = code === 0 ? 'stopped' : 'error';
        this.appendLog(cleanPhone, `Bot exited (code=${code}, signal=${signal})`);
        bot.process = null;
      });

      proc.on('error', (err) => {
        bot.status = 'error';
        this.appendLog(cleanPhone, `Failed to launch bot process: ${err.message}`);
        bot.process = null;
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
    this.stopBot(phone);
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          const b = this.startBot(phone);
          resolve(b);
        } catch (e) {
          resolve(null);
        }
      }, 1500);
    });
  }

  deleteBot(phone) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
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
      try {
        const credPath = path.join(multiSessionsDir, phone, 'creds.json');
        if (fs.existsSync(credPath)) {
          const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
          userName = creds.me?.name || creds.pushName || '';
        }
      } catch {}

      list.push({
        phone: b.phone,
        name: userName,
        status: b.status,
        startedAt: b.startedAt,
        uptime: b.startedAt && b.status === 'running' ? Math.floor((Date.now() - new Date(b.startedAt).getTime()) / 1000) : 0,
        logCount: b.logs.length,
        hasCreds: fs.existsSync(path.join(multiSessionsDir, phone, 'creds.json'))
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
  try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
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

    // Upload session to Firebase Cloud
    firebaseSync.saveSessionToCloud(cleanPhone, targetDir).catch(() => {});

    // Start user's isolated bot process
    setTimeout(() => {
      try {
        botManager.startBot(cleanPhone);
      } catch (err) {
        console.error(`[MULTI-SESSION] Error auto-launching bot for +${cleanPhone}:`, err);
      }
    }, 2000);

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
    auth: state,
    browser: Browsers.macOS('Desktop'),
    msgRetryCounterCache,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
  });

  activePairSockets.set(phone, { sock, sessionDir });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log(`[PAIR LINKED] Successfully connected WhatsApp for +${phone}`);
      try {
        await delay(3000);
        const credsPath = path.join(sessionDir, 'creds.json');
        if (!fs.existsSync(credsPath)) return;

        // Save to permanent sessions and start individual bot instance
        promoteToPermanentSession(phone, sessionDir);

        // Notify the user on WhatsApp
        const rawId = sock.user?.id || '';
        const userJid = rawId.includes(':') ? `${rawId.split(':')[0]}@s.whatsapp.net` : rawId;
        await sock.sendMessage(userJid, {
          text: `✅ *CypherX Bot Connected!* 🐉\n\n` +
                `*Phone:* +${phone}\n` +
                `*Status:* Active & Hosted on Multi-User Cloud\n\n` +
                `🤖 Your bot is now active and ready to process commands!`
        });
      } catch (e) {
        console.error('[ERROR] Post-pairing error:', e);
      } finally {
        await delay(4000);
        cleanupPairSocket(phone, sessionDir, sock);
      }

    } else if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut || code === 401) {
        console.log(`[PAIR LOGGED OUT] +${phone}`);
        cleanupPairSocket(phone, sessionDir, sock);
      } else {
        console.log(`[PAIR DISCONNECTED] +${phone}, code=${code}`);
        if (sock.authState?.creds?.registered && activePairSockets.has(phone)) {
          startPairSocket(phone, sessionDir);
        } else {
          cleanupPairSocket(phone, sessionDir, sock);
        }
      }
    }
  });

  return sock;
}

// ─────────────────────────────────────────────────────────────────
// API ROUTES: MULTI-BOT DASHBOARD & CONTROLS
// ─────────────────────────────────────────────────────────────────

// List all hosted bots
app.get('/api/bots', (req, res) => {
  const bots = botManager.listBots();
  return res.json({ success: true, bots });
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
    uptime: Math.floor((Date.now() - botManager.serverStartedAt.getTime()) / 1000),
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

// Start a specific bot  [PROTECTED]
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

// Delete & unlink a specific bot  [PROTECTED]
app.delete('/api/bots/:phone', requireAccessCode, (req, res) => {
  const { phone } = req.params;
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  botManager.deleteBot(cleanPhone);
  return res.json({ success: true, message: `Bot +${cleanPhone} session unlinked and deleted.` });
});

// ─────────────────────────────────────────────────────────────────
// API ROUTES: PAIRING CODE & QR GENERATION
// ─────────────────────────────────────────────────────────────────

// Route: Get pairing code  [PROTECTED]
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
    await delay(2000);

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
      auth: state,
      browser: Browsers.macOS('Desktop'),
      msgRetryCounterCache,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 120000,
      keepAliveIntervalMs: 15000,
    });

    qrSessions.set(sessionId, { qrDataUrl: null, linked: false, phone: null, sock, sessionDir, error: null });
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
          promoteToPermanentSession(phone, sessionDir);

          const userJid = rawId.includes(':') ? `${rawId.split(':')[0]}@s.whatsapp.net` : rawId;
          await sock.sendMessage(userJid, {
            text: `✅ *CypherX Bot Connected via QR!* 🐉\n\n*Phone:* +${phone}\n🤖 Hosted & Active on Multi-User Cloud!`
          });
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
          // brief pause then reconnect same session
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
                    promoteToPermanentSession(phone2, sessionDir);
                    const userJid = rawId.includes(':') ? `${rawId.split(':')[0]}@s.whatsapp.net` : rawId;
                    await sock2.sendMessage(userJid, {
                      text: `✅ *CypherX Bot Connected via QR!* 🐉\n\n*Phone:* +${phone2}\n🤖 Hosted & Active on Multi-User Cloud!`
                    });
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
    qr: session.qrDataUrl || null,
    error: session.error || null,
  });
});

// Route: Inject Session ID directly  [PROTECTED]
app.post('/api/inject-session', requireAccessCode, async (req, res) => {
  try {
    const { sessionId, phone: rawPhone } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Session ID string is required.' });
    }

    const base64 = sessionId.includes('~') ? sessionId.split('~')[1] : sessionId;
    let credsJson;
    try {
      const decoded = Buffer.from(base64.trim(), 'base64').toString('utf-8');
      credsJson = JSON.parse(decoded);
    } catch {
      return res.status(400).json({ error: 'Invalid base64 session credentials.' });
    }

    // Determine phone number from creds or input
    let phone = rawPhone ? String(rawPhone).replace(/[^0-9]/g, '') : '';
    if (!phone && credsJson.me?.id) {
      phone = credsJson.me.id.split(':')[0].replace(/[^0-9]/g, '');
    }
    if (!phone) {
      phone = `user_${Date.now()}`;
    }

    const userSessionDir = path.join(multiSessionsDir, phone);
    if (fs.existsSync(userSessionDir)) {
      fs.rmSync(userSessionDir, { recursive: true, force: true });
    }
    fs.mkdirSync(userSessionDir, { recursive: true });
    fs.writeFileSync(path.join(userSessionDir, 'creds.json'), JSON.stringify(credsJson, null, 2));

    console.log(`[INJECT] Injected credentials for +${phone}`);
    botManager.startBot(phone);

    return res.json({
      success: true,
      message: `Session credentials saved. Bot +${phone} is starting!`,
      phone
    });
  } catch (err) {
    console.error('[INJECT] Error:', err);
    return res.status(500).json({ error: 'Failed to inject session: ' + err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// SERVER INITIALIZATION
// ─────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🚀 CypherX Multi-User WhatsApp Bot Host Running!`);
  console.log(`🌐 Dashboard URL: http://localhost:${PORT}`);
  console.log(`📦 Sessions Storage: ${multiSessionsDir}`);
  console.log(`=================================================\n`);

  // Initialize and auto-boot all existing user sessions
  botManager.initAllSessions();
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
