import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  delay,
  DisconnectReason
} from '@whiskeysockets/baileys';
import pino from 'pino';
import NodeCache from 'node-cache';

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

// Path where the bot's session lives
const BOT_SESSION_DIR = path.join(__dirname, 'CypherX', 'CypherX-main', 'session');

/**
 * Injects a temp session folder into the CypherX bot session directory.
 */
function injectBotSession(sourceDir) {
  if (fs.existsSync(BOT_SESSION_DIR)) {
    fs.rmSync(BOT_SESSION_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(BOT_SESSION_DIR, { recursive: true });
  fs.cpSync(sourceDir, BOT_SESSION_DIR, { recursive: true });
  console.log(`[BOT] Session injected into CypherX bot session folder.`);
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
    browser: ['Mac OS', 'Safari', '14.1.2'],
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

    console.log(`[INJECT] Session ID injected directly into bot session folder.`);
    return res.json({ success: true, message: 'Session injected successfully. Bot is now linked!' });
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
