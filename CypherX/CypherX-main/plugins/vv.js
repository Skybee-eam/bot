const { downloadContentFromMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    name: "vv",
    alias: ["viewonce", "rvo", "dlvo", "readviewonce", "retrieve", "👁️", "👁", "👀", "🔓", "📸", "📩", "🔥", "❤️", "💖", "💕", "😍", "🥰", "💗", "💓", "💞", "💘"],
    category: "tools",
    description: "Bypasses and retrieves WhatsApp View Once media directly to chat",
    async execute(client, m, { args, prefix, command, reply }) {
        let mediaType = null;
        let mediaNode = null;
        let buffer = null;
        let targetJid = m.chat;

        try {
            if (!m.quoted) {
                return reply(`⚠️ *Please reply to a View-Once image, video, or audio with* *${prefix}${command}*`);
            }

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

            // Target destination:
            // Send directly to current chat (m.chat) by default so the user sees it immediately without "Waiting for this message"
            // If user explicitly specified "dm" or "private" in arguments, attempt to send to their private chat
            const isDmRequested = args && args[0] && /^(dm|pm|private|secret)$/i.test(args[0]);
            let sentToDm = false;

            if (isDmRequested && m.isGroup) {
                let userJid = m.sender;
                // If sender is an LID, try to find real phone number in groupMetadata
                if (userJid && userJid.includes('@lid')) {
                    const groupMeta = await client.groupMetadata?.(m.chat).catch(() => null);
                    const participant = groupMeta?.participants?.find(p => p.lid === userJid || p.id === userJid);
                    if (participant && participant.id && !participant.id.includes('@lid')) {
                        userJid = participant.id;
                    }
                }
                if (userJid && !userJid.includes('@lid')) {
                    targetJid = jidNormalizedUser(userJid);
                    sentToDm = true;
                }
            }

            const caption = (mediaNode.caption ? `📝 *Caption:* ${mediaNode.caption}\n\n` : '') +
                            `🔓 *View-Once Media Retrieved by Skybee Bot*`;

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
            // Fallback: if DM sending failed, try sending to m.chat
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