import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { spawn } from 'child_process';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  delay,
  DisconnectReason
} from '@whiskeysockets/baileys';
import pino from 'pino';
import NodeCache from 'node-cache';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure temp_sessions directory exists
const tempSessionsDir = path.join(__dirname, 'temp_sessions');
if (!fs.existsSync(tempSessionsDir)) {
  fs.mkdirSync(tempSessionsDir, { recursive: true });
}

// Keep active sockets alive so they don't get garbage collected
const activeSockets = new Map();
const msgRetryCounterCache = new NodeCache();

// QR code sessions: sessionId -> { qrDataUrl, linked, sock, sessionDir }
const qrSessions = new Map();

// ─────────────────────────────────────────────────────────────────
// BOT CONFIGURATION
// The real bot lives at this path. Session is injected here after
// pairing, and the bot is launched as a child process.
// ─────────────────────────────────────────────────────────────────
const BOT_DIR     = path.join(__dirname, 'CypherX', 'CypherX-main');
const BOT_SESSION_DIR = path.join(BOT_DIR, 'session');
const BOT_SRC_SESSION_DIR = path.join(BOT_DIR, 'src', 'Session');
const BOT_ENTRY   = path.join(BOT_DIR, 'bot-engine.js'); // full plugin engine

// External E: drive path for backup synchronization
const EXT_BOT_DIR = path.normalize('E:/Software/Ai Bot/Dark-Xploit-CypherX-6507e50');
const EXT_BOT_SESSION = path.join(EXT_BOT_DIR, 'session');

// Track the running bot process
let botProcess = null;
let botStatus  = 'stopped'; // 'stopped' | 'running' | 'error'
let botLog     = [];        // last 50 log lines

function appendBotLog(line) {
  botLog.push(line);
  if (botLog.length > 50) botLog.shift();
  process.stdout.write('[BOT] ' + line + '\n');
}

/**
 * Launch the bot as a child process.
 * Resolves when the process successfully starts (not when it exits).
 */
function launchBot() {
  if (botProcess) {
    appendBotLog('Bot already running (PID ' + botProcess.pid + ')');
    return;
  }

  const credsPath1 = path.join(BOT_SESSION_DIR, 'creds.json');
  const credsPath2 = path.join(BOT_SRC_SESSION_DIR, 'creds.json');
  if (!fs.existsSync(credsPath1) && !fs.existsSync(credsPath2)) {
    botStatus = 'error';
    appendBotLog('ERROR: No session credentials found. Link WhatsApp first.');
    return;
  }

  botStatus = 'running';
  appendBotLog(`Launching CypherX Plugin Engine (17 Plugins, 475 Commands)...`);

  botProcess = spawn('node', [BOT_ENTRY], {
    cwd: BOT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  botProcess.stdout.on('data', d => appendBotLog(d.toString().trim()));
  botProcess.stderr.on('data', d => appendBotLog('ERR: ' + d.toString().trim()));

  botProcess.on('exit', (code, signal) => {
    botStatus = code === 0 ? 'stopped' : 'error';
    appendBotLog(`Bot exited: code=${code} signal=${signal}`);
    botProcess = null;
  });

  botProcess.on('error', (err) => {
    botStatus = 'error';
    appendBotLog('Failed to start: ' + err.message);
    botProcess = null;
  });
}

function stopBot() {
  if (!botProcess) return;
  botProcess.kill('SIGTERM');
  botProcess = null;
  botStatus = 'stopped';
  appendBotLog('Bot stopped by user.');
}

/**
 * Injects a temp session folder into the bot session directory,
 * then auto-launches the bot.
 */
function injectBotSession(sourceDir) {
  try {
    // 1. Sync to CypherX session & src/Session
    if (fs.existsSync(BOT_SESSION_DIR)) {
      fs.rmSync(BOT_SESSION_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(BOT_SESSION_DIR, { recursive: true });
    fs.cpSync(sourceDir, BOT_SESSION_DIR, { recursive: true });

    if (fs.existsSync(BOT_SRC_SESSION_DIR)) {
      fs.rmSync(BOT_SRC_SESSION_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(BOT_SRC_SESSION_DIR, { recursive: true });
    fs.cpSync(sourceDir, BOT_SRC_SESSION_DIR, { recursive: true });

    // 2. Sync to E: drive directory as well
    try {
      if (fs.existsSync(EXT_BOT_DIR)) {
        if (fs.existsSync(EXT_BOT_SESSION)) {
          fs.rmSync(EXT_BOT_SESSION, { recursive: true, force: true });
        }
        fs.mkdirSync(EXT_BOT_SESSION, { recursive: true });
        fs.cpSync(sourceDir, EXT_BOT_SESSION, { recursive: true });
      }
    } catch {}

    console.log(`[BOT] Session injected into ${BOT_SESSION_DIR} and ${BOT_SRC_SESSION_DIR}`);
    // Auto-start the bot after a short delay
    setTimeout(() => launchBot(), 2000);
  } catch (err) {
    console.error('[BOT] Error injecting session:', err);
  }
}

function cleanupSocket(phone, sessionDir, sock) {
  try { sock?.ws?.close(); } catch {}
  try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
  activeSockets.delete(phone);
  console.log(`[CLEANUP] Session cleaned up for ${phone}`);
}

async function startSocket(phone, sessionDir) {
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    msgRetryCounterCache,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
  });

  activeSockets.set(phone, { sock, sessionDir });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log(`[CONNECTED] Successfully linked WhatsApp for ${phone}`);
      try {
        await delay(3000);
        const credsPath = path.join(sessionDir, 'creds.json');
        if (!fs.existsSync(credsPath)) return;

        // Inject the full session folder into CypherX bot
        injectBotSession(sessionDir);

        // Notify the user via WhatsApp
        const rawId = sock.user?.id || '';
        const userJid = rawId.includes(':') ? `${rawId.split(':')[0]}@s.whatsapp.net` : rawId;
        await sock.sendMessage(userJid, {
          text: `✅ *CypherX Bot Connected!* ✅\n\n` +
                `Your WhatsApp has been linked directly — no session ID needed!\n\n` +
                `🤖 The bot is now active and will respond to your messages shortly.`
        });
        console.log(`[SUCCESS] Bot credentials injected and user notified for ${phone}`);
      } catch (e) {
        console.error('[ERROR] Bot injection failed:', e);
      } finally {
        await delay(5000);
        cleanupSocket(phone, sessionDir, sock);
      }

    } else if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut || code === 401) {
        console.log(`[LOGGED OUT] ${phone}`);
        cleanupSocket(phone, sessionDir, sock);
      } else {
        console.log(`[DISCONNECTED] phone=${phone} statusCode=${code}`);
        if (sock.authState.creds.registered && activeSockets.has(phone)) {
          console.log(`[RECONNECTING] Already paired, reconnecting...`);
          startSocket(phone, sessionDir);
        } else {
          console.log(`[ABORT] Pairing dropped before completion. Cleaning up.`);
          cleanupSocket(phone, sessionDir, sock);
        }
      }
    }
  });

  return sock;
}

// ─────────────────────────────────────────────
// ROUTE: Get pairing code (standard WhatsApp link)
// ─────────────────────────────────────────────
app.get('/api/pair-code', async (req, res) => {
  let phone = req.query.phone;
  if (!phone) return res.status(400).json({ error: 'Phone number is required.' });

  phone = phone.replace(/[^0-9]/g, '');
  console.log(`[PAIR REQUEST] Phone: ${phone}`);

  if (activeSockets.has(phone)) {
    const old = activeSockets.get(phone);
    cleanupSocket(phone, old.sessionDir, old.sock);
    await delay(1000);
  }

  const sessionDir = path.join(tempSessionsDir, `session_${phone}_${Date.now()}`);

  try {
    const sock = await startSocket(phone, sessionDir);
    await delay(2000);

    if (!sock.authState.creds.registered) {
      let code = await sock.requestPairingCode(phone);
      code = code?.match(/.{1,4}/g)?.join('-') || code;
      console.log(`[CODE] ${phone} → ${code}`);

      // Auto-cleanup after 3 minutes if code not entered
      setTimeout(() => {
        if (activeSockets.has(phone)) {
          console.log(`[TIMEOUT] Cleaning up ${phone} due to inactivity`);
          cleanupSocket(phone, sessionDir, sock);
        }
      }, 180000);

      return res.json({ success: true, code });
    } else {
      cleanupSocket(phone, sessionDir, sock);
      return res.status(400).json({ error: 'Device is already registered.' });
    }
  } catch (err) {
    console.error('[ERROR] pair-code route:', err);
    try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
    activeSockets.delete(phone);
    return res.status(500).json({ error: 'Failed to generate code.' });
  }
});

// ─────────────────────────────────────
// ROUTE: Start QR code session
// ─────────────────────────────────────
app.post('/api/qr-start', async (req, res) => {
  const sessionId = 'qr_' + Date.now();
  const sessionDir = path.join(tempSessionsDir, `qr_session_${Date.now()}`);

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      browser: ['Ubuntu', 'Chrome', '20.0.04'],
      msgRetryCounterCache,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 120000,
      keepAliveIntervalMs: 15000,
      retryRequestDelayMs: 500,
    });

    qrSessions.set(sessionId, { qrDataUrl: null, linked: false, sock, sessionDir, error: null });
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, qr, lastDisconnect, isNewLogin } = update;

      // Capture QR as data URL every time a new QR is emitted
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
            session.error = null; // clear any previous error
          }
          console.log(`[QR] New QR generated for session ${sessionId}`);
        } catch (e) {
          console.error('[QR] Failed to generate QR data URL:', e);
        }
      }

      if (connection === 'open') {
        console.log(`[QR] Successfully linked via QR for session ${sessionId}`);
        const session = qrSessions.get(sessionId);
        if (session) session.linked = true;

        try {
          await delay(3000);
          injectBotSession(sessionDir);

          const rawId = sock.user?.id || '';
          const userJid = rawId.includes(':') ? `${rawId.split(':')[0]}@s.whatsapp.net` : rawId;
          await sock.sendMessage(userJid, {
            text: `✅ *CypherX Bot Connected via QR!* ✅\n\nYour WhatsApp has been linked — the bot is now active!`
          });
        } catch (e) {
          console.error('[QR] Post-link error:', e);
        } finally {
          await delay(5000);
          try { sock?.ws?.close(); } catch {}
          try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
          qrSessions.delete(sessionId);
        }

      } else if (connection === 'close') {
        const errOutput = lastDisconnect?.error?.output;
        const code = errOutput?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Unknown';
        console.log(`[QR] Connection closed for ${sessionId}: code=${code} reason=${reason}`);

        // 515 = restart required (WhatsApp asks client to reconnect after scan)
        // 428 = connection replaced (another device took over)
        // 401 = logged out
        if (code === DisconnectReason.loggedOut || code === 401) {
          const session = qrSessions.get(sessionId);
          if (session) session.error = 'Session expired. Please refresh the QR.';
          qrSessions.delete(sessionId);
          try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
        } else if (code === 515) {
          // WhatsApp wants a restart — reconnect to complete pairing
          console.log(`[QR] Reconnecting for session ${sessionId} (code 515)...`);
          startSocket(sessionId, sessionDir).catch(console.error);
        } else {
          // For other codes (e.g. 408 timeout, network error): keep session alive so QR re-shows
          console.log(`[QR] Non-fatal close for ${sessionId}, keeping session alive.`);
          const session = qrSessions.get(sessionId);
          if (session) session.error = `Connection issue (${code || reason}). Scan again or refresh.`;
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
        console.log(`[QR] Session ${sessionId} timed out.`);
      }
    }, 120000);

    return res.json({ success: true, sessionId });
  } catch (err) {
    console.error('[ERROR] qr-start route:', err);
    try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
    return res.status(500).json({ success: false, error: 'Failed to start QR session.' });
  }
});

// ─────────────────────────────────────
// ROUTE: Poll QR status
// ─────────────────────────────────────
app.get('/api/qr-status', (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' });

  const session = qrSessions.get(sessionId);
  if (!session) {
    // Session may have been cleaned up after linking
    return res.json({ linked: false, qr: null, error: 'Session expired or not found.' });
  }

  return res.json({
    linked: session.linked,
    qr: session.qrDataUrl || null,
    error: session.error || null,
  });
});


// ─────────────────────────────────────────────
// ROUTE: Inject session directly from RED-DRAGON~... session ID
// ─────────────────────────────────────────────
app.post('/api/inject-session', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required.' });
    }

    // Support both raw base64 and RED-DRAGON~base64 format
    const base64 = sessionId.includes('~') ? sessionId.split('~')[1] : sessionId;

    let credsJson;
    try {
      const decoded = Buffer.from(base64.trim(), 'base64').toString('utf-8');
      credsJson = JSON.parse(decoded); // validate it's valid JSON
    } catch {
      return res.status(400).json({ error: 'Invalid session ID. Could not decode credentials.' });
    }

    // Write creds.json directly into bot session folder
    if (fs.existsSync(BOT_SESSION_DIR)) {
      fs.rmSync(BOT_SESSION_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(BOT_SESSION_DIR, { recursive: true });
    const credsPath = path.join(BOT_SESSION_DIR, 'creds.json');
    fs.writeFileSync(credsPath, JSON.stringify(credsJson, null, 2));

    console.log(`[INJECT] Session ID injected into bot session folder.`);
    // Auto-launch bot
    setTimeout(() => launchBot(), 1500);
    return res.json({ success: true, message: 'Session injected! Bot is starting up now...' });
  } catch (err) {
    console.error('[ERROR] inject-session route:', err);
    return res.status(500).json({ error: 'Failed to inject session.' });
  }
});

// ─────────────────────────────────────────────
// ROUTE: Check if bot session exists
// ─────────────────────────────────────────────
app.get('/api/session-status', (req, res) => {
  const credsPath = path.join(BOT_SESSION_DIR, 'creds.json');
  const linked = fs.existsSync(credsPath);
  let phone = null;
  if (linked) {
    try {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
      phone = creds?.me?.id?.split(':')[0] || null;
    } catch {}
  }
  return res.json({ linked, phone });
});

// ─────────────────────────────────────────────
// ROUTE: Bot process status
// ─────────────────────────────────────────────
app.get('/api/bot-status', (req, res) => {
  return res.json({
    status: botStatus,
    pid: botProcess?.pid || null,
    log: botLog.slice(-20), // last 20 lines
  });
});

// ─────────────────────────────────────────────
// ROUTE: Start bot manually
// ─────────────────────────────────────────────
app.post('/api/bot-start', (req, res) => {
  if (botProcess) {
    return res.json({ success: false, message: 'Bot is already running.' });
  }
  launchBot();
  return res.json({ success: true, message: 'Bot launched.' });
});

// ─────────────────────────────────────────────
// ROUTE: Stop bot
// ─────────────────────────────────────────────
app.post('/api/bot-stop', (req, res) => {
  stopBot();
  return res.json({ success: true, message: 'Bot stopped.' });
});

const server = app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] Port ${PORT} is already in use. Kill the old process first.\n`);
  } else {
    console.error('[ERROR] Server:', err);
  }
});
