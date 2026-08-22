/**
 * CypherX Full Bot Engine
 * Loads all 19 Plugins (477 Commands), initializes database and connects to WhatsApp
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadContentFromMessage,
  proto,
  jidNormalizedUser,
  getContentType,
  makeCacheableSignalKeyStore,
  Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache');

// Load developer settings & global variables
require('./src/Core/developer');

// Database initialization
const { loadDatabase, saveDatabase } = require('./src/Core/database');
const pluginManager = require('./src/Core/executor');

let retryCount = 0;
let isStarting = false;

// Retry counter cache & message store for session decryption & retries
const msgRetryCounterCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const messageStore = new Map();

// Ensure temp/tmp directories exist
const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

// Automated Session Cleaner (Purges inactive session files older than 2 days)
function cleanInactiveSessions(authDir) {
  try {
    if (!fs.existsSync(authDir)) return 0;
    const now = Date.now();
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(authDir);
    let purgedCount = 0;

    for (const file of files) {
      // NEVER delete creds.json or sync keys
      if (file === 'creds.json' || file.startsWith('app-state-sync-key')) continue;
      
      const filePath = path.join(authDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > TWO_DAYS_MS) {
          fs.unlinkSync(filePath);
          purgedCount++;
          console.log(`[SESSION-CLEANER] Auto-purged inactive session file: ${file}`);
        }
      } catch {}
    }

    if (purgedCount > 0) {
      console.log(`[SESSION-CLEANER] Successfully removed ${purgedCount} inactive session file(s) older than 2 days.`);
    }
    return purgedCount;
  } catch (err) {
    console.error('[SESSION-CLEANER Error]:', err.message);
    return 0;
  }
}

// Media download helper
async function downloadMediaMessage(message) {
  let mimeMap = {
    imageMessage: 'image',
    videoMessage: 'video',
    stickerMessage: 'sticker',
    documentMessage: 'document',
    audioMessage: 'audio'
  };

  let type = Object.keys(message)[0];
  let msg = message[type];
  if (type === 'templateMessage') {
    let template = message.templateMessage.hydratedTemplate || message.templateMessage.hydratedFourRowTemplate;
    type = Object.keys(template)[0];
    msg = template[type];
  } else if (type === 'buttonsMessage') {
    type = Object.keys(message.buttonsMessage)[0];
    msg = message.buttonsMessage[type];
  }

  let streamType = mimeMap[type] || type.replace('Message', '');
  let stream = await downloadContentFromMessage(msg, streamType);
  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  return buffer;
}

async function downloadAndSaveMediaMessage(message, filename) {
  let buffer = await downloadMediaMessage(message);
  let ext = 'bin';
  if (message.mimetype) {
    ext = message.mimetype.split('/')[1] || 'bin';
    ext = ext.split(';')[0];
  }
  let filePath = filename || path.join(tmpDir, `${Date.now()}.${ext}`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

// Extract clean message text from any WhatsApp message structure
function getMessageText(m) {
  if (!m || !m.message) return '';
  const msg = m.message;
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.templateButtonReplyMessage?.selectedId ||
    ''
  );
}

// Parse and normalize a Baileys message object
async function serializeMessage(Cypher, m) {
  if (!m.message) return null;

  m.mtype = getContentType(m.message) || Object.keys(m.message)[0];
  m.msg = m.message[m.mtype];
  m.id = m.key.id;
  m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16;
  m.chat = m.key.remoteJid;
  m.fromMe = m.key.fromMe;
  m.isGroup = m.chat.endsWith('@g.us');
  m.sender = jidNormalizedUser(
    m.fromMe ? Cypher.user.id : (m.isGroup ? m.key.participant : m.chat)
  );
  m.pushName = m.pushName || '';

  m.body = getMessageText(m);
  m.text = m.body;

  // Quoted message handling
  const contextInfo = m.msg?.contextInfo ||
                      m.message?.extendedTextMessage?.contextInfo ||
                      m.message?.imageMessage?.contextInfo ||
                      m.message?.videoMessage?.contextInfo ||
                      m.message?.audioMessage?.contextInfo ||
                      m.message?.documentMessage?.contextInfo;

  if (contextInfo && contextInfo.quotedMessage) {
    const qMtype = getContentType(contextInfo.quotedMessage) || Object.keys(contextInfo.quotedMessage)[0];
    const qMsg = contextInfo.quotedMessage[qMtype];
    m.quoted = {
      message: contextInfo.quotedMessage,
      key: {
        remoteJid: m.chat,
        fromMe: contextInfo.participant === Cypher.user.id,
        id: contextInfo.stanzaId,
        participant: contextInfo.participant
      },
      id: contextInfo.stanzaId,
      sender: jidNormalizedUser(contextInfo.participant),
      text: getMessageText({ message: contextInfo.quotedMessage }),
      mimetype: qMsg?.mimetype || '',
      mtype: qMtype,
      msg: qMsg,
      contextInfo
    };
  } else {
    m.quoted = null;
  }

  // Check admin & owner status
  const botNumber = jidNormalizedUser(Cypher.user.id);
  m.isOwner = m.sender === botNumber ||
              (global.ownerNumber && global.ownerNumber.includes(m.sender.split('@')[0])) ||
              m.fromMe;

  m.reply = (text, options = {}) => {
    return Cypher.sendMessage(m.chat, { text: String(text), ...options }, { quoted: m });
  };

  return m;
}

async function startCypherBot() {
  if (isStarting) return;
  isStarting = true;

  console.log('[CYPHER-X] Initializing CypherX Engine...');

  // 1. Initialize databases
  try {
    await loadDatabase();
    console.log('[CYPHER-X] Database loaded successfully.');
  } catch (err) {
    console.log('[CYPHER-X] Database note:', err.message);
  }

  // 2. Load all plugins (both src/Plugins and root plugins/)
  await pluginManager.loadAllPlugins();

  // 3. Find valid auth directory
  let authDir = path.join(__dirname, 'session');
  if (!fs.existsSync(path.join(authDir, 'creds.json'))) {
    authDir = path.join(__dirname, 'src', 'Session');
  }
  if (!fs.existsSync(path.join(authDir, 'creds.json'))) {
    authDir = path.join(__dirname, 'session');
  }

  console.log(`[CYPHER-X] Using session directory: ${authDir}`);
  
  // Safe auto-purge of stale session peer/prekey files older than 2 days
  cleanInactiveSessions(authDir);
  if (!global.sessionCleanupInterval) {
    global.sessionCleanupInterval = setInterval(() => cleanInactiveSessions(authDir), 12 * 60 * 60 * 1000);
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const Cypher = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    browser: Browsers.macOS('Desktop'),
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 25000,
    msgRetryCounterCache,
    getMessage: async (key) => {
      if (messageStore.has(key.id)) {
        return messageStore.get(key.id);
      }
      return proto.Message.fromObject({});
    }
  });

  // Attach helper methods to socket
  Cypher.downloadMediaMessage = downloadMediaMessage;
  Cypher.downloadAndSaveMediaMessage = downloadAndSaveMediaMessage;

  // sendFile compatibility helper
  Cypher.sendFile = async (jid, pathOrBuffer, filename = '', caption = '', quoted = null, ptt = false, options = {}) => {
    let buffer = Buffer.isBuffer(pathOrBuffer) ? pathOrBuffer : (typeof pathOrBuffer === 'string' && fs.existsSync(pathOrBuffer) ? fs.readFileSync(pathOrBuffer) : null);
    if (!buffer && typeof pathOrBuffer === 'string' && pathOrBuffer.startsWith('http')) {
      const axios = require('axios');
      const res = await axios.get(pathOrBuffer, { responseType: 'arraybuffer' });
      buffer = Buffer.from(res.data);
    }
    if (!buffer) return;

    let type = 'document';
    const ext = filename ? path.extname(filename).toLowerCase() : '';
    if (/\.(jpg|jpeg|png|webp)/i.test(ext)) type = 'image';
    else if (/\.(mp4|mkv|avi|mov)/i.test(ext)) type = 'video';
    else if (/\.(mp3|m4a|wav|opus|ogg)/i.test(ext)) type = 'audio';

    const sendPayload = {};
    if (type === 'image') sendPayload.image = buffer;
    else if (type === 'video') sendPayload.video = buffer;
    else if (type === 'audio') { sendPayload.audio = buffer; sendPayload.ptt = ptt; sendPayload.mimetype = 'audio/mp4'; }
    else { sendPayload.document = buffer; sendPayload.mimetype = options.mimetype || 'application/octet-stream'; sendPayload.fileName = filename; }

    if (caption && type !== 'audio') sendPayload.caption = caption;

    return Cypher.sendMessage(jid, sendPayload, { quoted, ...options });
  };

  Cypher.ev.on('creds.update', saveCreds);

  Cypher.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      retryCount = 0;
      isStarting = false;
      console.log('\n==============================================');
      console.log('  🐉 RED DRAGON / CYPHER-X BOT CONNECTED! 🐉  ');
      console.log(`  ✅ ${pluginManager.commandMap.size} Commands & Plugins Loaded and Active `);
      console.log('==============================================\n');
    }

    if (connection === 'close') {
      isStarting = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || 'Unknown';
      console.log(`[CYPHER-X] Connection closed (code=${code}, reason=${reason})`);

      if (code === DisconnectReason.loggedOut) {
        console.log('[CYPHER-X] Session logged out. Please re-link WhatsApp from the web panel.');
        process.exit(0);
        return;
      }

      retryCount++;
      const delayTime = Math.min(retryCount * 2000, 10000);
      console.log(`[CYPHER-X] Reconnecting in ${delayTime / 1000}s... (Attempt #${retryCount})`);
      setTimeout(() => startCypherBot(), delayTime);
    }
  });

  // 4. Handle incoming messages & dispatch to plugins
  Cypher.ev.on('messages.upsert', async ({ messages, type }) => {
    try {
      if (!messages || !messages[0]) return;
      const rawMsg = messages[0];

      // Save raw message for retry decryption if needed
      if (rawMsg.key && rawMsg.key.id && rawMsg.message) {
        messageStore.set(rawMsg.key.id, rawMsg.message);
        if (messageStore.size > 500) {
          const firstKey = messageStore.keys().next().value;
          messageStore.delete(firstKey);
        }
      }

      // Ignore status broadcast updates
      if (rawMsg.key && rawMsg.key.remoteJid === 'status@broadcast') return;

      const m = await serializeMessage(Cypher, rawMsg);
      if (!m || !m.body) return;

      const body = m.body.trim();
      const prefixMatch = body.match(/^[./!#$?]/);
      const prefix = prefixMatch ? prefixMatch[0] : '.';
      let isCmd = body.startsWith(prefix);

      let command = isCmd ? body.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase() : '';
      const text = isCmd ? body.slice(prefix.length + command.length).trim() : body;
      const args = text ? text.split(/\s+/) : [];

      // Direct emoji command triggers without prefix (e.g. typing 👁️, 👁, 👀, 🔓, 📸 directly)
      const emojiTriggers = ['👁️', '👁', '👀', '🔓', '📸', '📩', '🔥', '❤️', '💖', '💕', '😍', '🥰', '💗', '💓', '💞', '💘'];
      if (!isCmd && emojiTriggers.includes(body)) {
        isCmd = true;
        command = body;
      }

      let groupMetadata = null;
      let participants = [];
      let groupAdmins = [];
      let isBotAdmin = false;
      let isAdmin = false;

      if (m.isGroup) {
        try {
          groupMetadata = await Cypher.groupMetadata(m.chat);
          participants = groupMetadata.participants || [];
          groupAdmins = participants.filter(p => p.admin).map(p => p.id);
          const botId = jidNormalizedUser(Cypher.user.id);
          isBotAdmin = groupAdmins.includes(botId);
          isAdmin = groupAdmins.includes(m.sender);
        } catch {}
      }

      m.isAdmin = isAdmin;
      m.isBotAdmin = isBotAdmin;

      const globalContext = {
        Cypher,
        m,
        reply: m.reply,
        text,
        args,
        prefix,
        command,
        from: m.chat,
        pushname: m.pushName,
        isGroup: m.isGroup,
        groupMetadata,
        participants,
        groupAdmins,
        isBotAdmin,
        isAdmin,
        isOwner: m.isOwner,
        isCreator: m.isOwner,
        mainOwner: global.ownerNumber || '',
        mess: global.mess || {},
        quoted: m.quoted,
        mime: m.quoted?.mimetype || m.msg?.mimetype || '',
        filter: ''
      };

      // 1. Dispatch to loaded plugin (from plugins/ or src/Plugins/) if matched
      if (isCmd && command) {
        const executed = await pluginManager.executePlugin(globalContext, command);
        if (executed) {
          console.log(`[CYPHER-X] Executed command: "${prefix}${command}" from ${m.sender}`);
          return;
        }
      }

      // 2. Built-in command fallbacks
      if (command === 'alive') {
        return m.reply(`*🐉 RED DRAGON OFC BOT IS ALIVE! 🐉*\n\n✅ *Status:* Online & Ready\n🤖 *Engine:* CypherX v1.6.7\n📦 *Commands Loaded:* ${pluginManager.commandMap.size}\n⚡ *Type .menu to see all commands!*`);
      }

      if (['menu', 'help', 'list', 'commands', 'allmenu'].includes(command)) {
        const menuText = pluginManager.generateDynamicMenu(prefix, text, m.pushName || 'User');
        return m.reply(menuText);
      }

    } catch (err) {
      console.error('[CYPHER-X] Error processing message:', err);
    }
  });

  // 5. Handle reaction-based triggers (e.g. reacting with 👁️, 👀, or 🔓 on a View Once message)
  Cypher.ev.on('messages.reaction', async (reactions) => {
    try {
      if (!reactions || !reactions[0]) return;
      for (const r of reactions) {
        const emoji = r.reaction;
        const emojiTriggers = ['👁️', '👁', '👀', '🔓', '📸', '📩', '🔥', '❤️', '💖', '💕', '😍', '🥰', '💗', '💓', '💞', '💘'];
        if (emoji && emojiTriggers.includes(emoji)) {
          const key = r.key;
          const reactorJid = jidNormalizedUser(r.sender || (key.fromMe ? Cypher.user.id : (key.participant || key.remoteJid)));
          const cachedMsg = messageStore.get(key.id);

          if (cachedMsg) {
            const simulatedM = {
              quoted: {
                message: cachedMsg,
                key: key
              },
              key: key,
              chat: key.remoteJid,
              sender: reactorJid,
              isGroup: key.remoteJid.endsWith('@g.us'),
              fromReaction: true,
              reply: (text) => Cypher.sendMessage(reactorJid, { text })
            };

            await pluginManager.executePlugin({
              Cypher,
              m: simulatedM,
              command: 'vv',
              prefix: '.',
              reply: simulatedM.reply,
              text: '',
              args: []
            }, 'vv');
            console.log(`[CYPHER-X] Decrypted View-Once via reaction "${emoji}" from ${reactorJid}`);
          }
        }
      }
    } catch (err) {
      console.error('[CYPHER-X] Error in reaction handler:', err);
    }
  });
}

startCypherBot().catch((err) => {
  console.error('[CYPHER-X] Fatal startup error:', err);
  process.exit(1);
});
