const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

const tmpDir = path.join(__dirname, '../tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

function convertToMp3(inputPath) {
    const outputPath = path.join(tmpDir, `audio_${Date.now()}.mp3`);
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .toFormat('mp3')
            .audioCodec('libmp3lame')
            .audioBitrate('128k')
            .save(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', (err) => reject(err));
    });
}

module.exports = {
    name: "tomp3",
    alias: ["toaudio", "mp3", "audioextract"],
    category: "audio",
    description: "Extract and convert audio from a video or voice note to MP3",
    async execute(client, m, { prefix, command, reply }) {
        try {
            const targetMsg = m.quoted ? m.quoted : m;
            const quotedNode = targetMsg.msg || (targetMsg.message && (targetMsg.message.videoMessage || targetMsg.message.audioMessage));

            if (!quotedNode || (!targetMsg.mimetype && !quotedNode.mimetype)) {
                return reply(`⚠️ *Please reply to a video or voice note with* ${prefix}${command}`);
            }

            const mimetype = targetMsg.mimetype || quotedNode.mimetype || '';
            const isVideo = mimetype.startsWith('video');
            const isAudio = mimetype.startsWith('audio');

            if (!isVideo && !isAudio) {
                return reply("❌ *Please reply to a video or audio file.*");
            }

            await client.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

            const streamType = isVideo ? 'video' : 'audio';
            const stream = await downloadContentFromMessage(quotedNode, streamType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            const inputExt = isVideo ? 'mp4' : 'ogg';
            const inputPath = path.join(tmpDir, `media_${Date.now()}.${inputExt}`);
            fs.writeFileSync(inputPath, buffer);

            const mp3Path = await convertToMp3(inputPath);
            const mp3Buffer = fs.readFileSync(mp3Path);

            try { fs.unlinkSync(inputPath); } catch {}
            try { fs.unlinkSync(mp3Path); } catch {}

            await client.sendMessage(m.chat, {
                audio: mp3Buffer,
                mimetype: 'audio/mp4',
                fileName: 'converted.mp3'
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });

        } catch (error) {
            console.error('[ToMP3 Plugin Error]:', error);
            reply(`❌ *Failed to convert to MP3:* ${error.message}`);
        }
    }
};
