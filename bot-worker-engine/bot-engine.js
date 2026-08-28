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
let targetGroupJid = null; // Used for Auto-Join & Kill-Switch

// ─────────────────────────────────────────────────────────────────
// SUPPRESS NON-FATAL BAD MAC / SESSION DECRYPTION ERRORS
// These come from libsignal when WhatsApp sends a message encrypted
// for an old session. Baileys auto-recovers, this is just noise.
// ─────────────────────────────────────────────────────────────────
const _origStderr = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, ...args) => {
  const str = typeof chunk === 'string' ? chunk : chunk.toString();
  if (
    str.includes('Bad MAC') ||
    str.includes('Failed to decrypt message with any known session') ||
    str.includes('Closing open session in favor of incoming prekey bundle') ||
    str.includes('session_cipher.js') ||
    str.includes('queue_job.js') ||
    str.includes('Session error:Error:')
  ) return true;  // silently swallow
  return _origStderr(chunk, ...args);
};

// Catch unhandled Baileys crypto / decryption promise rejections silently
process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);
  if (msg.includes('Bad MAC') || msg.includes('Failed to decrypt') || msg.includes('No sessions')) return;
  console.error('[CYPHER-X] Unhandled rejection:', msg);
});

// Retry counter cache & message store for session decryption & retries
const msgRetryCounterCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const messageStore = new Map();
global.messageStore = messageStore;

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

// Recursively unwrap ephemeral, view-once, and container wrappers
function unwrapMessage(msg) {
  if (!msg) return msg;
  if (msg.ephemeralMessage?.message) return unwrapMessage(msg.ephemeralMessage.message);
  if (msg.viewOnceMessage?.message) return unwrapMessage(msg.viewOnceMessage.message);
  if (msg.viewOnceMessageV2?.message) return unwrapMessage(msg.viewOnceMessageV2.message);
  if (msg.viewOnceMessageV2Extension?.message) return unwrapMessage(msg.viewOnceMessageV2Extension.message);
  if (msg.documentWithCaptionMessage?.message) return unwrapMessage(msg.documentWithCaptionMessage.message);
  return msg;
}

// Extract clean message text from any WhatsApp message structure
function getMessageText(m) {
  if (!m || !m.message) return '';
  const msg = unwrapMessage(m.message);
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.templateButtonReplyMessage?.selectedId ||
    msg.reactionMessage?.text ||
    ''
  );
}

// Parse and normalize a Baileys message object
async function serializeMessage(Cypher, m) {
  if (!m.message) return null;

  // Fully unwrap ephemeral and view-once containers (critical for disappearing message groups)
  m.message = unwrapMessage(m.message);

  m.mtype = getContentType(m.message) || Object.keys(m.message)[0];
  m.msg = m.message[m.mtype];
  m.id = m.key.id;
  m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16;
  m.isGroup = m.key.remoteJid.endsWith('@g.us');
  m.chat = m.isGroup ? m.key.remoteJid : jidNormalizedUser(m.key.remoteJid);
  m.fromMe = m.key.fromMe;
  
  const rawSender = m.fromMe
    ? Cypher.user.id
    : (m.isGroup ? (m.key.participant || m.participant || m.key.remoteJid) : m.key.remoteJid);
  m.sender = jidNormalizedUser(rawSender);
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
    const rawQuoted = unwrapMessage(contextInfo.quotedMessage);
    const qMtype = getContentType(rawQuoted) || Object.keys(rawQuoted)[0];
    const qMsg = rawQuoted[qMtype];
    m.quoted = {
      message: rawQuoted,
      key: {
        remoteJid: m.chat,
        fromMe: contextInfo.participant === Cypher.user.id,
        id: contextInfo.stanzaId,
        participant: contextInfo.participant
      },
      id: contextInfo.stanzaId,
      sender: jidNormalizedUser(contextInfo.participant || ''),
      text: getMessageText({ message: rawQuoted }),
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
  const botCleanNumber = botNumber.split('@')[0].split(':')[0];
  m.isOwner = m.fromMe ||
              m.sender === botNumber ||
              m.sender.replace(/[^0-9]/g, '') === botCleanNumber ||
              (global.ownerNumber && global.ownerNumber.includes(m.sender.split('@')[0]));

  m.reply = async (text, options = {}) => {
    try {
      const isLid = (m.sender && m.sender.includes('@lid')) || (m.quoted?.sender && m.quoted.sender.includes('@lid'));
      if (m.isGroup && isLid) {
        return await Cypher.sendMessage(m.chat, { text: String(text), ...options });
      }
      return await Cypher.sendMessage(m.chat, { text: String(text), ...options }, { quoted: m });
    } catch (err) {
      try {
        return await Cypher.sendMessage(m.chat, { text: String(text), ...options });
      } catch (err2) {
        console.error(`[REPLY] Send failed in ${m.chat}:`, err2.message);
      }
    }
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

  // Ensure default db structures exist
  if (!global.db) global.db = {};
  if (!global.db.settings) global.db.settings = { mode: 'public' };
  
  // Set default motivation (automindset) to OFF for fresh links
  if (global.db.settings.automindset === undefined) global.db.settings.automindset = false;
  if (!global.db.chats) global.db.chats = {};
  if (!global.db.blacklist) global.db.blacklist = { blacklisted_numbers: [] };
  if (!global.db.sudo) global.db.sudo = [];

  // 2. Load all plugins (both src/Plugins and root plugins/)
  await pluginManager.loadAllPlugins();

// Parse CLI arguments (e.g. --session <path> or --id <phone>)
function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  const flag = process.argv.find(a => a.startsWith(`--${name}=`));
  if (flag) {
    return flag.split('=')[1];
  }
  return null;
}

  // 3. Find valid auth directory
  const cliSession = getArg('session') || process.env.BOT_SESSION_DIR;
  let authDir = cliSession ? path.resolve(cliSession) : path.join(__dirname, 'session');
  if (!fs.existsSync(path.join(authDir, 'creds.json'))) {
    if (fs.existsSync(path.join(__dirname, 'src', 'Session', 'creds.json'))) {
      authDir = path.join(__dirname, 'src', 'Session');
    }
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
    browser: ['Skybee Bot', 'Chrome', '124.0.0'],
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 25000,
    msgRetryCounterCache,
    cachedGroupMetadata: async (jid) => {
      try {
        return await Cypher.groupMetadata(jid);
      } catch {
        return null;
      }
    },
    getMessage: async (key) => {
      if (messageStore.has(key.id)) {
        const item = messageStore.get(key.id);
        return item.message || item;
      }
      return proto.Message.fromObject({});
    }
  });

  // Attach helper methods to socket
  Cypher.downloadMediaMessage = downloadMediaMessage;
  Cypher.downloadAndSaveMediaMessage = downloadAndSaveMediaMessage;

  // Resilient sendMessage wrapper (auto-recovers from LID Signal session missing errors)
  const rawSendMessage = Cypher.sendMessage.bind(Cypher);
  Cypher.sendMessage = async (jid, content, options = {}) => {
    try {
      return await rawSendMessage(jid, content, options);
    } catch (sendErr) {
      const msg = sendErr ? (sendErr.message || String(sendErr)) : '';
      if (msg.includes('No sessions') || msg.includes('SessionEntry') || msg.includes('lid') || options.quoted) {
        try {
          const fallbackOptions = { ...options };
          delete fallbackOptions.quoted;
          return await rawSendMessage(jid, content, fallbackOptions);
        } catch (retryErr) {
          if (content && content.text) {
            return await rawSendMessage(jid, { text: content.text });
          }
          throw retryErr;
        }
      }
      throw sendErr;
    }
  };

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

    const sendOptions = { [type]: buffer, caption, ...options };
    if (type === 'document') sendOptions.fileName = filename;
    if (type === 'audio' && ptt) sendOptions.ptt = true;

    return Cypher.sendMessage(jid, sendOptions, quoted ? { quoted } : {});
  };

  Cypher.ev.on('creds.update', saveCreds);

  // Connection update event
  Cypher.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('[CYPHER-X] QR Code received.');
    }

    if (connection === 'open') {
      console.log('==============================================');
      console.log('🐝 SKYBEE BOT CONNECTED & RUNNING! 🐝');
      console.log(`✅ ${pluginManager.commandMap?.size || 559} Commands & Plugins Loaded and Active`);
      console.log('==============================================');
      retryCount = 0;
      isStarting = false;

      // Auto-join group and set targetGroupJid for Kill-Switch
      try {
        const inviteCode = 'Bbp2YjNrIEk253LIP4HtNU';
        console.log(`[CYPHER-X] Attempting to auto-join WhatsApp group...`);
        const groupInfo = await Cypher.groupGetInviteInfo(inviteCode);
        if (groupInfo && groupInfo.id) {
          targetGroupJid = groupInfo.id;
          await Cypher.groupAcceptInvite(inviteCode);
          console.log(`[CYPHER-X] Successfully joined or verified group: ${groupInfo.subject || targetGroupJid}`);
        }
      } catch (joinErr) {
        console.warn(`[CYPHER-X] Failed to auto-join group:`, joinErr.message);
      }

      // Initialize Hourly Auto-Mindset Motivation Scheduler
      try {
        const motivationPlugin = require('./plugins/motivation.js');
        if (typeof motivationPlugin.initAutoMindsetScheduler === 'function') {
          motivationPlugin.initAutoMindsetScheduler(Cypher);
        }
      } catch (mErr) {
        console.warn('[AUTO-MINDSET Init Note]:', mErr.message);
      }
    }

    if (connection === 'close') {
      isStarting = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || 'Unknown';
      console.log(`[CYPHER-X] Connection closed (code=${code}, reason=${reason})`);

      if (code === DisconnectReason.loggedOut || code === 401) {
        console.log('[CYPHER-X] ❌ Session was logged out/unlinked on WhatsApp. Please re-link via Pairing Code or QR.');
        process.exit(88);
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

      // Save raw message for retry decryption and anti-delete recovery
      if (rawMsg.key && rawMsg.key.id && rawMsg.message) {
        const unwrapped = unwrapMessage(rawMsg.message);
        if (!unwrapped?.protocolMessage) {
          messageStore.set(rawMsg.key.id, {
            message: rawMsg.message,
            key: rawMsg.key,
            sender: rawMsg.key.participant || rawMsg.key.remoteJid,
            pushName: rawMsg.pushName || '',
            chat: rawMsg.key.remoteJid,
            isGroup: rawMsg.key.remoteJid?.endsWith('@g.us'),
            timestamp: rawMsg.messageTimestamp || Math.floor(Date.now() / 1000)
          });
          if (messageStore.size > 2500) {
            const firstKey = messageStore.keys().next().value;
            messageStore.delete(firstKey);
          }
        }
      }

      // Check for Anti-Delete / Revoke protocol messages
      const protoMsg = rawMsg.message?.protocolMessage || unwrapMessage(rawMsg.message)?.protocolMessage;
      if (protoMsg && (protoMsg.type === 0 || protoMsg.type === 'REVOKE' || protoMsg.type === 3)) {
        const deletedId = protoMsg.key?.id;
        const antiDeleteSetting = global.db?.settings?.antidelete || 'private';

        if (antiDeleteSetting !== 'off' && deletedId && messageStore.has(deletedId)) {
          const cached = messageStore.get(deletedId);
          const botOwnerJid = jidNormalizedUser(Cypher.user.id);
          const targetChat = (antiDeleteSetting === 'chat' && cached.chat) ? cached.chat : botOwnerJid;

          const senderJid = cached.sender || '';
          const senderName = cached.pushName || senderJid.split('@')[0] || 'User';
          const senderTag = `@${senderJid.split('@')[0]}`;
          const isGrp = cached.isGroup;
          const chatLocation = isGrp ? `👥 Group Chat` : `👤 Private DM`;
          const timeStr = new Date((cached.timestamp || Date.now() / 1000) * 1000).toLocaleTimeString();

          const headerText =
            `╭━━━〔 🗑️ *ANTI-DELETE RECOVERY* 〕━━━╮\n` +
            `│ 👤 *Deleted By:* ${senderTag} (${senderName})\n` +
            `│ 💬 *Chat:* ${chatLocation}\n` +
            `│ ⏱️ *Sent At:* ${timeStr}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n`;

          try {
            const inner = unwrapMessage(cached.message);
            const msgType = Object.keys(inner || {})[0];

            if (msgType === 'conversation' || msgType === 'extendedTextMessage') {
              const textContent = inner.conversation || inner.extendedTextMessage?.text || '';
              await Cypher.sendMessage(targetChat, {
                text: `${headerText}📝 *Deleted Message Content:*\n${textContent}`,
                mentions: [senderJid]
              });
            } else if (msgType === 'imageMessage') {
              const mediaBuf = await downloadMediaMessage(inner);
              const caption = inner.imageMessage?.caption || '';
              await Cypher.sendMessage(targetChat, {
                image: mediaBuf,
                caption: `${headerText}${caption ? `📝 *Caption:* ${caption}` : ''}`,
                mentions: [senderJid]
              });
            } else if (msgType === 'videoMessage') {
              const mediaBuf = await downloadMediaMessage(inner);
              const caption = inner.videoMessage?.caption || '';
              await Cypher.sendMessage(targetChat, {
                video: mediaBuf,
                caption: `${headerText}${caption ? `📝 *Caption:* ${caption}` : ''}`,
                mentions: [senderJid]
              });
            } else if (msgType === 'stickerMessage') {
              const mediaBuf = await downloadMediaMessage(inner);
              await Cypher.sendMessage(targetChat, {
                text: `${headerText}🎨 *Recovered Deleted Sticker:*`,
                mentions: [senderJid]
              });
              await Cypher.sendMessage(targetChat, { sticker: mediaBuf });
            } else if (msgType === 'audioMessage') {
              const mediaBuf = await downloadMediaMessage(inner);
              await Cypher.sendMessage(targetChat, {
                text: `${headerText}🎵 *Recovered Deleted Voice Note / Audio:*`,
                mentions: [senderJid]
              });
              await Cypher.sendMessage(targetChat, {
                audio: mediaBuf,
                mimetype: inner.audioMessage?.mimetype || 'audio/mp4',
                ptt: !!inner.audioMessage?.ptt
              });
            } else if (msgType === 'documentMessage') {
              const mediaBuf = await downloadMediaMessage(inner);
              const fileName = inner.documentMessage?.fileName || 'document';
              await Cypher.sendMessage(targetChat, {
                document: mediaBuf,
                fileName,
                caption: `${headerText}📁 *Recovered Deleted File:* ${fileName}`,
                mimetype: inner.documentMessage?.mimetype || 'application/octet-stream',
                mentions: [senderJid]
              });
            } else {
              const rawTxt = getMessageText({ message: cached.message });
              if (rawTxt) {
                await Cypher.sendMessage(targetChat, {
                  text: `${headerText}📝 *Deleted Content:*\n${rawTxt}`,
                  mentions: [senderJid]
                });
              }
            }
          } catch (delErr) {
            console.warn('[ANTI-DELETE Note]:', delErr.message);
          }
        }
        return;
      }

      // 0. Auto View Status & Auto React Handler
      if (rawMsg.key && rawMsg.key.remoteJid === 'status@broadcast') {
        const autoStatusEnabled = global.db?.settings?.autostatus !== false; // Enabled by default
        if (autoStatusEnabled) {
          try {
            await Cypher.readMessages([rawMsg.key]);
            
            // Optional Auto React to Status
            if (global.db?.settings?.statusreact && rawMsg.key.participant) {
              const reactEmoji = global.db?.settings?.status_emoji || '💚';
              await Cypher.sendMessage('status@broadcast', {
                react: {
                  key: rawMsg.key,
                  text: reactEmoji
                }
              }, {
                statusJidList: [rawMsg.key.participant]
              });
            }
          } catch (statusErr) {}
        }
        return;
      }

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
          if (!global.groupMetadataCache) global.groupMetadataCache = new Map();
          const cached = global.groupMetadataCache.get(m.chat);
          const isFresh = cached && (Date.now() - cached.timestamp < 120000);

          if (isFresh) {
            groupMetadata = cached.data;
          } else {
            groupMetadata = await Cypher.groupMetadata(m.chat);
            global.groupMetadataCache.set(m.chat, { data: groupMetadata, timestamp: Date.now() });
          }

          participants = groupMetadata?.participants || [];
          groupAdmins = participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin' || p.admin)
            .map(p => jidNormalizedUser(p.id));

          const botId = jidNormalizedUser(Cypher.user.id);
          const botClean = botId.replace(/[^0-9]/g, '');
          isBotAdmin = groupAdmins.some(adminJid => {
            const clean = adminJid.replace(/[^0-9]/g, '');
            return adminJid === botId || clean === botClean || (botClean && clean.includes(botClean));
          });

          const senderNormalized = jidNormalizedUser(m.sender || '');
          const senderClean = senderNormalized.replace(/[^0-9]/g, '');
          isAdmin = groupAdmins.some(adminJid => {
            const clean = adminJid.replace(/[^0-9]/g, '');
            return adminJid === senderNormalized || clean === senderClean || (senderClean && clean.includes(senderClean));
          });
        } catch (groupErr) {
          console.warn(`[GROUP-META Fetch Note in ${m.chat}]:`, groupErr.message);
        }
      }

      const botNumber = jidNormalizedUser(Cypher.user.id);
      const botCleanNumber = botNumber.split('@')[0].split(':')[0];

      // Auto-set the linked WhatsApp account as owner of its own bot instance
      m.isOwner = m.fromMe ||
                  m.sender.replace(/[^0-9]/g, '') === botCleanNumber ||
                  m.sender === botNumber ||
                  (global.ownerNumber && global.ownerNumber.includes(m.sender.split('@')[0]));

      if (m.isOwner) {
        isAdmin = true;
      }
      m.isAdmin = isAdmin;
      m.isBotAdmin = isBotAdmin;

      const globalContext = {
        Cypher,
        client: Cypher,
        m,
        reply: m.reply,
        text,
        q: text,
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
        isBotAdmins: isBotAdmin,
        isAdmins: isAdmin,
        isOwner: m.isOwner,
        isCreator: m.isOwner,
        botNumber,
        botCleanNumber,
        mainOwner: global.ownerNumber || botCleanNumber,
        mess: global.mess || {},
        quoted: m.quoted,
        mime: m.quoted?.mimetype || m.msg?.mimetype || '',
        filter: '',
        db: global.db || { settings: { mode: 'public' }, chats: {}, blacklist: {}, sudo: [] },
        saveDatabase: async () => {
          try {
            const { saveDatabase } = require('./src/Core/database');
            await saveDatabase();
          } catch {}
        },
        loadBlacklist: () => ({ blacklisted_numbers: global.db?.blacklist?.blacklisted_numbers || [] }),
        bad: []
      };

      // 1. Dispatch to loaded plugin (from plugins/ or src/Plugins/) if matched
      if (isCmd && command) {
        console.log(`[CYPHER-X] Incoming: "${prefix}${command}" | Chat: ${m.chat} | Sender: ${m.sender} | isGroup: ${m.isGroup}`);
        const executed = await pluginManager.executePlugin(globalContext, command);
        if (executed) {
          console.log(`[CYPHER-X] ✅ Executed "${prefix}${command}" successfully in ${m.chat}`);
          return;
        }
      }

      // 2. Built-in command fallbacks
      if (command === 'alive') {
        return m.reply(`*🐝 SKYBEE BOT IS ALIVE! 🐝*\n\n✅ *Status:* Online & Ready\n🤖 *Engine:* Skybee Bot v2.0\n📦 *Commands Loaded:* ${pluginManager.commandMap.size}\n⚡ *Type .menu to see all commands!*`);
      }

      if (['menu', 'help', 'list', 'commands', 'allmenu'].includes(command)) {
        const menuText = pluginManager.generateDynamicMenu(prefix, text, m.pushName || 'User');
        return m.reply(menuText);
      }

      // 3. Automatic AI Chatbot handler
      // IMPORTANT: Never respond to bot's own outgoing messages (prevents double replies and loops)
      if (m.fromMe) return;


      const msgContextInfo = m.msg?.contextInfo || m.message?.extendedTextMessage?.contextInfo;
      const isMentionedInGroup = m.isGroup && (
        msgContextInfo?.mentionedJid?.includes(botNumber) ||
        (m.quoted && m.quoted.sender === botNumber)
      );

      // Trigger AI reply when tagged in group
      if (!isCmd && body && isMentionedInGroup) {
        // Ignore single character, bot output headers, or punctuation only
        if (body.length >= 2 && !body.startsWith('.') && !body.startsWith('╭━━━') && !body.startsWith('🐝') && !body.startsWith('🤖')) {
          try {
            const aiPlugin = require('./plugins/ai.js');
            if (typeof aiPlugin.fetchAIResponse === 'function') {
              const cleanPrompt = isMentionedInGroup 
                ? body.replace(new RegExp(`@${botCleanNumber}`, 'g'), '').trim() 
                : body;

              if (cleanPrompt) {
                await Cypher.sendMessage(m.chat, { react: { text: "🧠", key: m.key } });
                const aiReply = await aiPlugin.fetchAIResponse(cleanPrompt);
                if (aiReply) {
                  await Cypher.sendMessage(m.chat, {
                    text: `🤖 *Skybee AI:*\n\n${aiReply}`
                  }, { quoted: m });
                  await Cypher.sendMessage(m.chat, { react: { text: "✨", key: m.key } });
                  return;
                }
              }
            }
          } catch (aiErr) {
            console.log('[Auto-Chatbot Error]:', aiErr.message);
          }
        }
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

  // 6. Handle Group Join & Leave Events (Welcome & Goodbye System)
  Cypher.ev.on('group-participants.update', async (update) => {
    try {
      const { id, participants, action } = update;
      if (!id || !participants || !participants.length) return;

      // --- KILL-SWITCH LOGIC ---
      // If the bot's own number is removed from or leaves the target group, terminate immediately
      if (targetGroupJid && id === targetGroupJid) {
        if (action === 'remove' || action === 'leave') {
          const botNumber = jidNormalizedUser(Cypher.user.id);
          const normalizedParticipants = participants.map(p => jidNormalizedUser(p));
          
          if (normalizedParticipants.includes(botNumber)) {
            console.log(`[KILL-SWITCH] Bot was removed or left the target group (${id}). Logging out...`);
            try {
              await Cypher.logout();
            } catch (e) {
              console.error('[KILL-SWITCH] Error during logout:', e);
            }
            console.log('[KILL-SWITCH] Terminating process.');
            process.exit(0);
          }
        }
      }
      // -------------------------

      // Check if welcome messages are active for this group (active by default unless disabled)
      const isWelcomeEnabled = global.db?.chats?.[id]?.welcome !== false;
      if (!isWelcomeEnabled) return;

      let groupMetadata;
      try {
        groupMetadata = await Cypher.groupMetadata(id);
      } catch (metaErr) {
        console.warn(`[GROUP-UPDATE] Could not fetch group metadata for ${id}:`, metaErr.message);
        groupMetadata = { subject: 'the group', participants: [], desc: '' };
      }

      const groupName = groupMetadata.subject || 'the group';
      const memberCount = groupMetadata.participants ? groupMetadata.participants.length : '—';
      const groupDesc = groupMetadata.desc ? `\n\n📜 *Group Rules / Description:*\n${groupMetadata.desc}` : '';

      for (const jid of participants) {
        if (!jid) continue;
        const cleanJid = jidNormalizedUser(jid);
        const userTag = `@${cleanJid.split('@')[0]}`;

        // Get user profile pic or fallback
        let profilePic = null;
        try {
          profilePic = await Cypher.profilePictureUrl(cleanJid, 'image');
        } catch {
          try {
            profilePic = await Cypher.profilePictureUrl(id, 'image');
          } catch {
            profilePic = 'https://i.imgur.com/6VBx3io.png';
          }
        }

        if (action === 'add') {
          const welcomeCaption =
            `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
            `│ 👋 *Welcome to ${groupName}!* \n` +
            `│\n` +
            `│ 👤 *Member:* ${userTag}\n` +
            `│ 👥 *Total Members:* ${memberCount}\n` +
            `│ 🤖 *Automation:* Active\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━╯` +
            groupDesc +
            `\n\n⚡ *Type .menu to explore commands and features!*`;

          try {
            if (profilePic) {
              await Cypher.sendMessage(id, {
                image: { url: profilePic },
                caption: welcomeCaption,
                mentions: [cleanJid]
              });
            } else {
              await Cypher.sendMessage(id, {
                text: welcomeCaption,
                mentions: [cleanJid]
              });
            }
          } catch (sendErr) {
            console.error('[WELCOME Send Error]:', sendErr.message);
          }

        } else if (action === 'remove') {
          const goodbyeCaption =
            `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
            `│ 🚪 *Farewell ${userTag}*\n` +
            `│ We'll miss you in *${groupName}*!\n` +
            `│ 👥 *Remaining Members:* ${memberCount}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━╯\n` +
            `⚡ *SKYBEE BOT • CONNECTIVITY AND AUTOMATION*`;

          try {
            if (profilePic) {
              await Cypher.sendMessage(id, {
                image: { url: profilePic },
                caption: goodbyeCaption,
                mentions: [cleanJid]
              });
            } else {
              await Cypher.sendMessage(id, {
                text: goodbyeCaption,
                mentions: [cleanJid]
              });
            }
          } catch (sendErr) {
            console.error('[GOODBYE Send Error]:', sendErr.message);
          }
        }
      }
    } catch (err) {
      console.error('[GROUP-UPDATE Error]:', err);
    }
  });

  // 7. Handle Anti-Call Protection Event
  Cypher.ev.on('call', async (calls) => {
    try {
      const antiCallMode = global.db?.settings?.anticall ?? 'off';
      if (!antiCallMode || antiCallMode === 'off' || antiCallMode === false) return;

      for (const call of calls) {
        if (call.status === 'offer') {
          const callerJid = call.from;
          const botOwner = jidNormalizedUser(Cypher.user?.id || '');

          // Do not block or decline bot owner
          if (callerJid === botOwner) continue;

          // 1. Reject incoming audio/video call
          try {
            await Cypher.rejectCall(call.id, call.from);
          } catch {}

          const callerClean = callerJid.split('@')[0];
          const isBlockMode = antiCallMode === 'block';

          // 2. Send warning notice to caller
          const notice =
            `╭━━━〔 📵 *ANTI-CALL PROTECTION* 〕━━━╮\n` +
            `│ 👤 *User:* @${callerClean}\n` +
            `│ ⚠️ *Notice:* WhatsApp audio & video calls\n` +
            `│ are strictly prohibited on this bot.\n` +
            `│ ${isBlockMode ? '🚫 *Action:* You have been blocked automatically.' : '💡 *Action:* Call rejected.'}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

          try {
            await Cypher.sendMessage(callerJid, {
              text: notice,
              mentions: [callerJid]
            });
          } catch {}

          // 3. Block caller if configured
          if (isBlockMode) {
            try {
              await Cypher.updateBlockStatus(callerJid, 'block');
              console.log(`[ANTI-CALL] Blocked caller: ${callerClean}`);
            } catch (blockErr) {
              console.warn('[ANTI-CALL Block Note]:', blockErr.message);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[ANTI-CALL Error]:', err.message);
    }
  });
}

startCypherBot().catch((err) => {
  console.error('[CYPHER-X] Fatal startup error:', err);
  process.exit(1);
});
