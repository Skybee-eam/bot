const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    name: "vv",
    alias: ["viewonce", "rvo", "dlvo", "readviewonce", "👁️", "👁", "👀", "🔓", "📸", "📩", "🔥", "❤️", "💖", "💕", "😍", "🥰", "💗", "💓", "💞", "💘"],
    category: "tools",
    description: "Download and secretly send WhatsApp View Once media to sender's DM, then auto-delete the command",
    async execute(client, m, { args, prefix, command, reply, isBotAdmin }) {
        const targetJid = m.sender; // User's private DM

        try {
            if (!m.quoted) {
                return client.sendMessage(targetJid, {
                    text: `⚠️ *Please reply to a View Once message (image, video, or audio) with* ${prefix}${command}`
                });
            }

            let quotedMsg = m.quoted.message;
            if (!quotedMsg) {
                return client.sendMessage(targetJid, {
                    text: "❌ *Cannot access quoted message content.*"
                });
            }

            // Unwrap View Once containers
            if (quotedMsg.viewOnceMessageV2) {
                quotedMsg = quotedMsg.viewOnceMessageV2.message;
            } else if (quotedMsg.viewOnceMessage) {
                quotedMsg = quotedMsg.viewOnceMessage.message;
            } else if (quotedMsg.viewOnceMessageV2Extension) {
                quotedMsg = quotedMsg.viewOnceMessageV2Extension.message;
            }

            // Identify media type and inner message object
            let mediaType = null;
            let mediaNode = null;

            if (quotedMsg.imageMessage) {
                mediaType = 'image';
                mediaNode = quotedMsg.imageMessage;
            } else if (quotedMsg.videoMessage) {
                mediaType = 'video';
                mediaNode = quotedMsg.videoMessage;
            } else if (quotedMsg.audioMessage) {
                mediaType = 'audio';
                mediaNode = quotedMsg.audioMessage;
            } else {
                // Fallback check
                const keys = Object.keys(quotedMsg);
                for (let k of keys) {
                    if (k.endsWith('Message') && /image|video|audio/.test(k)) {
                        mediaType = k.replace('Message', '');
                        mediaNode = quotedMsg[k];
                        break;
                    }
                }
            }

            if (!mediaType || !mediaNode) {
                return client.sendMessage(targetJid, {
                    text: "❌ *The replied message is not a valid View Once image, video, or audio.*"
                });
            }

            // Stream and decrypt media chunks from WhatsApp CDN in memory
            const stream = await downloadContentFromMessage(mediaNode, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            if (!buffer || buffer.length === 0) {
                return client.sendMessage(targetJid, {
                    text: "❌ *Failed to decrypt media buffer.*"
                });
            }

            const senderInfo = m.isGroup ? `\n👥 *From Group:* ${m.chat}` : '';
            const caption = (mediaNode.caption ? `💬 *Caption:* ${mediaNode.caption}\n\n` : '') +
                `🔓 *Secret View-Once Media Retrieved*` + senderInfo;

            // Send permanently to the sender's private DM
            if (mediaType === 'image') {
                await client.sendMessage(targetJid, {
                    image: buffer,
                    caption: caption
                });
            } else if (mediaType === 'video') {
                await client.sendMessage(targetJid, {
                    video: buffer,
                    caption: caption,
                    mimetype: mediaNode.mimetype || 'video/mp4'
                });
            } else if (mediaType === 'audio') {
                await client.sendMessage(targetJid, {
                    audio: buffer,
                    mimetype: mediaNode.mimetype || 'audio/mp4',
                    ptt: mediaNode.ptt || false
                });
            }

        } catch (error) {
            console.error('[VV Plugin Error]:', error);
            try {
                await client.sendMessage(targetJid, {
                    text: `❌ *Failed to retrieve View Once media:* ${error.message}`
                });
            } catch { }
        }
    }
};
S