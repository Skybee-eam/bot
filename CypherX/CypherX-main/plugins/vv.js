const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    name: "vv",
    alias: ["viewonce", "rvo", "dlvo", "readviewonce", "retrieve", "👁️", "👁", "👀", "🔓", "📸", "📩", "🔥", "❤️", "💖", "💕", "😍", "🥰", "💗", "💓", "💞", "💘"],
    category: "tools",
    description: "Bypasses and retrieves WhatsApp View Once media directly",
    async execute(client, m, { args, prefix, command, reply }) {
        try {
            if (!m.quoted) {
                return reply(`⚠️ *Please reply to a View-Once image, video, or audio with* *${prefix}vv*`);
            }

            // 1. Check in-memory store for complete raw message headers
            let rawMsg = null;
            if (global.messageStore && m.quoted.id && global.messageStore.has(m.quoted.id)) {
                const stored = global.messageStore.get(m.quoted.id);
                rawMsg = stored.message || stored;
            }

            let targetNode = rawMsg || m.quoted.message || m.quoted.msg;
            if (!targetNode) {
                return reply("❌ *Cannot access quoted message content. Message may have expired.*");
            }

            // Helper to recursively unwrap View Once and ephemeral wrappers
            function unwrap(obj) {
                if (!obj) return null;
                if (obj.viewOnceMessageV2?.message) return unwrap(obj.viewOnceMessageV2.message);
                if (obj.viewOnceMessage?.message) return unwrap(obj.viewOnceMessage.message);
                if (obj.viewOnceMessageV2Extension?.message) return unwrap(obj.viewOnceMessageV2Extension.message);
                if (obj.ephemeralMessage?.message) return unwrap(obj.ephemeralMessage.message);
                if (obj.documentWithCaptionMessage?.message) return unwrap(obj.documentWithCaptionMessage.message);
                return obj;
            }

            const unwrapped = unwrap(targetNode);

            let mediaType = null;
            let mediaNode = null;

            if (unwrapped.imageMessage) {
                mediaType = 'image';
                mediaNode = unwrapped.imageMessage;
            } else if (unwrapped.videoMessage) {
                mediaType = 'video';
                mediaNode = unwrapped.videoMessage;
            } else if (unwrapped.audioMessage) {
                mediaType = 'audio';
                mediaNode = unwrapped.audioMessage;
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

            // Decrypt & stream media buffer
            const stream = await downloadContentFromMessage(mediaNode, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            if (!buffer || buffer.length === 0) {
                return reply("❌ *Failed to decrypt View Once media stream.*");
            }

            const caption = (mediaNode.caption ? `📝 *Caption:* ${mediaNode.caption}\n\n` : '') +
                            `🔓 *View-Once Media Bypassed & Retrieved by Skybee Bot*`;

            // Send permanently to the current chat
            if (mediaType === 'image') {
                await client.sendMessage(m.chat, {
                    image: buffer,
                    caption: caption
                });
            } else if (mediaType === 'video') {
                await client.sendMessage(m.chat, {
                    video: buffer,
                    caption: caption,
                    mimetype: mediaNode.mimetype || 'video/mp4'
                });
            } else if (mediaType === 'audio') {
                await client.sendMessage(m.chat, {
                    audio: buffer,
                    mimetype: mediaNode.mimetype || 'audio/mp4',
                    ptt: !!mediaNode.ptt
                });
            }

        } catch (error) {
            console.error('[VV Plugin Error]:', error);
            reply(`❌ *Failed to retrieve View Once media:* ${error.message}`);
        }
    }
};