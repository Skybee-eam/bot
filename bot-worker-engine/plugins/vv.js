const { downloadContentFromMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    name: "vv",
    alias: ["viewonce", "rvo", "dlvo", "readviewonce", "retrieve", "vvdm", "viewoncedm", "setviewonce", "👁️", "👁", "👀", "🔓", "📸", "📩", "🔥", "❤️", "💖", "💕", "😍", "🥰", "💗", "💓", "💞", "💘"],
    category: "tools",
    description: "Bypasses and retrieves WhatsApp View Once media directly to chat or private DM",
    async execute(client, m, { args, text, prefix, command, isOwner, reply, db, saveDatabase, groupMetadata }) {
        const database = global.db || db || { settings: {} };
        if (!database.settings) database.settings = {};

        async function persistDb() {
            if (typeof saveDatabase === 'function') {
                await saveDatabase();
            } else {
                try {
                    const { saveDatabase: saveDb } = require('../src/Core/database');
                    await saveDb();
                } catch {}
            }
        }

        const subCommand = (args && args.length) ? args.join(' ').toLowerCase().trim() : '';
        const firstArg = (args && args[0]) ? args[0].toLowerCase().trim() : '';

        // Check if user is executing a configuration command (e.g. .vv dm, .vv dm on, .vv dm off, .vv chat, .vv status)
        // If m.quoted is present, only treat as config if explicitly phrased as "dm on", "dm off", "chat", "status", etc.
        const isExplicitConfig = /^(dm\s+(on|off|true|false|1|0)|(set\s+)?(chat|dm|pm|private|group|here)|status|check)$/i.test(subCommand) ||
                                 (!m.quoted && /^(dm|pm|private|on|off|chat|group|here|status|check)$/i.test(firstArg));

        if (isExplicitConfig || (!m.quoted && (command === 'vvdm' || command === 'viewoncedm' || command === 'setviewonce'))) {
            const hasOwnerPerm = isOwner || m.isOwner;

            if (subCommand === 'status' || subCommand === 'check') {
                const activeMode = (database.settings.viewonce_mode === 'dm' || database.settings.viewonce_dm) ? 'dm' : 'chat';
                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ 📊 *View-Once Delivery Status*\n` +
                    `│ 📡 Active Mode: *${activeMode === 'dm' ? 'PRIVATE DM 📥' : 'CURRENT CHAT 💬'}*\n` +
                    `│ 💡 When unlocked, media goes to: ${activeMode === 'dm' ? 'Private DM' : 'Current Chat'}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                    `📌 *To Change Mode:*\n` +
                    `• *${prefix}vv dm* or *${prefix}vv dm on* (Deliver to Private DM)\n` +
                    `• *${prefix}vv dm off* or *${prefix}vv chat* (Deliver to Current Chat)`
                );
            }

            if (!hasOwnerPerm) {
                return reply("⚠️ *This setting can only be changed by the bot owner.*");
            }

            if (subCommand === 'dm' || subCommand === 'dm on' || subCommand === 'on' || subCommand === 'private' || subCommand === 'pm' || firstArg === 'dm' || firstArg === 'on' || firstArg === 'private') {
                if (subCommand.includes('off')) {
                    database.settings.viewonce_mode = 'chat';
                    database.settings.viewonce_dm = false;
                    await persistDb();
                    return reply(
                        `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                        `│ 👁️ *View-Once Delivery Updated!*\n` +
                        `│ 💬 Mode: *Current Chat*\n` +
                        `│ 📢 Unlocked View-Once media will\n` +
                        `│ be sent directly into the active chat.\n` +
                        `╰━━━━━━━━━━━━━━━━━━━━━╯`
                    );
                }

                database.settings.viewonce_mode = 'dm';
                database.settings.viewonce_dm = true;
                await persistDb();

                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ 👁️ *View-Once Delivery Updated!*\n` +
                    `│ 📥 Mode: *Private DM*\n` +
                    `│ 🔒 All unlocked View-Once media\n` +
                    `│ will be sent directly to your private DM.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯`
                );
            } else if (subCommand === 'dm off' || subCommand === 'off' || subCommand === 'chat' || subCommand === 'group' || subCommand === 'here' || firstArg === 'chat' || firstArg === 'off') {
                database.settings.viewonce_mode = 'chat';
                database.settings.viewonce_dm = false;
                await persistDb();

                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ 👁️ *View-Once Delivery Updated!*\n` +
                    `│ 💬 Mode: *Current Chat*\n` +
                    `│ 📢 Unlocked View-Once media will\n` +
                    `│ be sent directly into the active chat.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯`
                );
            }
        }

        if (!m.quoted) {
            const activeMode = (database.settings.viewonce_mode === 'dm' || database.settings.viewonce_dm) ? 'dm' : 'chat';
            return reply(
                `╭━━━〔 👁️ VIEW-ONCE MANAGER 〕━━━╮\n` +
                `│ 📡 Active Mode: *${activeMode === 'dm' ? 'PRIVATE DM 📥' : 'CURRENT CHAT 💬'}*\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                `💡 *How to Retrieve View-Once Media:*\n` +
                `Reply to any View-Once photo, video, or audio with *${prefix}${command}*\n` +
                `_(Or type *${prefix}${command} dm* while quoting to force send to DM)_\n\n` +
                `⚙️ *Delivery Mode Configuration:*\n` +
                `• *${prefix}vv dm* or *${prefix}vv dm on* - Set delivery to Private DM\n` +
                `• *${prefix}vv dm off* or *${prefix}vv chat* - Set delivery to Current Chat\n` +
                `• *${prefix}vv status* - Check current delivery destination`
            );
        }

        let mediaType = null;
        let mediaNode = null;
        let buffer = null;
        let targetJid = m.chat;

        try {
            // 1. Check in-memory store for complete raw message headers (best source for media decryption keys)
            let rawMsg = null;
            const quotedId = m.quoted.id || m.quoted.key?.id;
            if (global.messageStore && quotedId && global.messageStore.has(quotedId)) {
                const stored = global.messageStore.get(quotedId);
                rawMsg = stored.message || stored;
            }

            // Try getQuotedObj if available and rawMsg not yet found
            if (!rawMsg && typeof m.getQuotedObj === 'function') {
                try {
                    const qObj = await m.getQuotedObj();
                    if (qObj && qObj.message) {
                        rawMsg = qObj.message;
                    }
                } catch {}
            }

            let targetNode = rawMsg || m.quoted.message || m.quoted.msg;
            if (!targetNode) {
                return reply("❌ *Cannot access quoted message content. Message may have expired.*");
            }

            // Helper to recursively unwrap View Once and ephemeral wrappers
            function unwrap(obj) {
                if (!obj) return null;
                if (obj.message) return unwrap(obj.message);
                if (obj.viewOnceMessageV2?.message) return unwrap(obj.viewOnceMessageV2.message);
                if (obj.viewOnceMessage?.message) return unwrap(obj.viewOnceMessage.message);
                if (obj.viewOnceMessageV2Extension?.message) return unwrap(obj.viewOnceMessageV2Extension.message);
                if (obj.ephemeralMessage?.message) return unwrap(obj.ephemeralMessage.message);
                if (obj.documentWithCaptionMessage?.message) return unwrap(obj.documentWithCaptionMessage.message);
                return obj;
            }

            const unwrapped = unwrap(targetNode);
            if (!unwrapped) {
                return reply("❌ *Could not unwrap view once message content.*");
            }

            if (unwrapped.imageMessage) {
                mediaType = 'image';
                mediaNode = unwrapped.imageMessage;
            } else if (unwrapped.videoMessage) {
                mediaType = 'video';
                mediaNode = unwrapped.videoMessage;
            } else if (unwrapped.audioMessage) {
                mediaType = 'audio';
                mediaNode = unwrapped.audioMessage;
            } else if (unwrapped.mimetype && (unwrapped.url || unwrapped.mediaKey || unwrapped.directPath)) {
                if (unwrapped.mimetype.startsWith('image/')) mediaType = 'image';
                else if (unwrapped.mimetype.startsWith('video/')) mediaType = 'video';
                else if (unwrapped.mimetype.startsWith('audio/')) mediaType = 'audio';
                mediaNode = unwrapped;
            } else {
                for (let k of Object.keys(unwrapped)) {
                    if (k.endsWith('Message') && /image|video|audio/.test(k)) {
                        mediaType = k.replace('Message', '');
                        mediaNode = unwrapped[k];
                        break;
                    }
                }
            }

            if (!mediaType || !mediaNode) {
                return reply("❌ *The replied message is not a valid View Once image, video, or audio.*");
            }

            // React to indicate processing
            if (m.key) {
                try {
                    await client.sendMessage(m.chat, {
                        react: { text: "🔓", key: m.key }
                    });
                } catch {}
            }

            // Decrypt & stream media buffer
            const stream = await downloadContentFromMessage(mediaNode, mediaType);
            let chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            buffer = Buffer.concat(chunks);

            if (!buffer || buffer.length === 0) {
                return reply("❌ *Failed to decrypt View Once media stream.*");
            }

            // Delivery Destination Logic:
            // 1. Explicit command override: e.g. .vv dm -> force DM; .vv chat -> force chat
            // 2. Default preference from database.settings.viewonce_mode or viewonce_dm
            const isExplicitDm = /^(dm|pm|private|secret)$/i.test(firstArg);
            const isExplicitChat = /^(chat|group|here)$/i.test(firstArg);
            const defaultIsDm = database.settings?.viewonce_mode === 'dm' || database.settings?.viewonce_dm === true;

            const shouldSendToDm = (isExplicitDm || (!isExplicitChat && defaultIsDm)) && m.isGroup;
            let sentToDm = false;

            if (shouldSendToDm) {
                let userJid = m.realSender || m.sender;
                // If sender is an LID, resolve real phone number from groupMetadata
                if (userJid && userJid.includes('@lid')) {
                    const groupMeta = groupMetadata || await client.groupMetadata?.(m.chat).catch(() => null);
                    const participant = groupMeta?.participants?.find(p => p.lid === userJid || p.id === userJid);
                    if (participant?.id && !participant.id.includes('@lid')) {
                        userJid = participant.id;
                    }
                }
                if (userJid && !userJid.includes('@lid')) {
                    targetJid = jidNormalizedUser(userJid);
                    sentToDm = true;
                }
            }

            const groupSubject = groupMetadata?.subject || (m.isGroup ? 'Group Chat' : '');
            const caption = (mediaNode.caption ? `📝 *Caption:* ${mediaNode.caption}\n\n` : '') +
                            `🔓 *View-Once Media Retrieved by Skybee Bot*` +
                            (sentToDm && groupSubject ? `\n👥 *From:* ${groupSubject}` : '');

            const sendOptions = targetJid === m.chat ? { quoted: m } : {};

            if (mediaType === 'image') {
                await client.sendMessage(targetJid, {
                    image: buffer,
                    caption: caption
                }, sendOptions);
            } else if (mediaType === 'video') {
                await client.sendMessage(targetJid, {
                    video: buffer,
                    caption: caption,
                    mimetype: mediaNode.mimetype || 'video/mp4'
                }, sendOptions);
            } else if (mediaType === 'audio') {
                await client.sendMessage(targetJid, {
                    audio: buffer,
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt: true
                }, sendOptions);
            }

            if (sentToDm && m.isGroup) {
                await reply(`🔒 *Check your private DM!* The View-Once media was sent to your private chat.`);
            }

        } catch (error) {
            console.error('[VV Plugin Error]:', error);
            // Fallback: if DM sending failed, try sending to m.chat so user doesn't lose the unlocked media
            try {
                if (mediaType && buffer && buffer.length > 0 && targetJid !== m.chat) {
                    const caption = (mediaNode?.caption ? `📝 *Caption:* ${mediaNode.caption}\n\n` : '') +
                                    `🔓 *View-Once Media Retrieved by Skybee Bot*`;
                    if (mediaType === 'image') {
                        await client.sendMessage(m.chat, { image: buffer, caption }, { quoted: m });
                    } else if (mediaType === 'video') {
                        await client.sendMessage(m.chat, { video: buffer, caption, mimetype: mediaNode.mimetype || 'video/mp4' }, { quoted: m });
                    } else if (mediaType === 'audio') {
                        await client.sendMessage(m.chat, { audio: buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: m });
                    }
                    return;
                }
            } catch {}
            reply(`❌ *Failed to retrieve View Once media:* ${error.message}`);
        }
    }
};