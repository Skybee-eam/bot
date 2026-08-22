const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

const tmpDir = path.join(__dirname, '../tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

async function convertToSticker(inputPath, isVideo = false) {
    const outputPath = path.join(tmpDir, `${Date.now()}.webp`);
    return new Promise((resolve, reject) => {
        let cmd = ffmpeg(inputPath)
            .addOutputOptions([
                '-vcodec', 'libwebp',
                '-vf', "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse"
            ])
            .toFormat('webp');

        if (isVideo) {
            cmd.setDuration(5);
        }

        cmd.save(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', (err) => reject(err));
    });
}

module.exports = {
    name: "sticker",
    alias: ["s", "stiker", "stickergif", "sgif"],
    category: "tools",
    description: "Convert quoted or attached image/video into a WhatsApp sticker",
    async execute(client, m, { prefix, command, reply }) {
        try {
            const targetMsg = m.quoted ? m.quoted : m;
            const quotedNode = targetMsg.msg || (targetMsg.message && (targetMsg.message.imageMessage || targetMsg.message.videoMessage));

            if (!quotedNode || (!targetMsg.mimetype && !quotedNode.mimetype)) {
                return reply(`⚠️ *Please reply to an image or short video with* ${prefix}${command}`);
            }

            const mimetype = targetMsg.mimetype || quotedNode.mimetype || '';
            const isImage = mimetype.startsWith('image');
            const isVideo = mimetype.startsWith('video');

            if (!isImage && !isVideo) {
                return reply("❌ *Unsupported media format. Reply to an image or video.*");
            }

            await client.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

            const streamType = isImage ? 'image' : 'video';
            const stream = await downloadContentFromMessage(quotedNode, streamType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            const inputExt = isImage ? 'png' : 'mp4';
            const inputPath = path.join(tmpDir, `input_${Date.now()}.${inputExt}`);
            fs.writeFileSync(inputPath, buffer);

            const stickerPath = await convertToSticker(inputPath, isVideo);
            const stickerBuffer = fs.readFileSync(stickerPath);

            // Clean up temp files
            try { fs.unlinkSync(inputPath); } catch {}
            try { fs.unlinkSync(stickerPath); } catch {}

            await client.sendMessage(m.chat, {
                sticker: stickerBuffer
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });

        } catch (error) {
            console.error('[Sticker Plugin Error]:', error);
            reply(`❌ *Failed to convert to sticker:* ${error.message}`);
        }
    }
};
