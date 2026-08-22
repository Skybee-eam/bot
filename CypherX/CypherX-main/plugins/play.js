const yts = require('yt-search');
const axios = require('axios');

module.exports = {
    name: "play",
    alias: ["ytmp3", "song", "audio", "music"],
    category: "download",
    description: "Search YouTube and download audio as MP3",
    async execute(client, m, { text, prefix, command, reply }) {
        try {
            if (!text) {
                return reply(`⚠️ *Please provide a song title or YouTube link, e.g.:*\n${prefix}${command} Alan Walker Faded`);
            }

            await client.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

            // Search YouTube
            const searchResults = await yts(text);
            const video = searchResults.videos && searchResults.videos[0];
            if (!video) {
                return reply("❌ *No YouTube results found for your search query.*");
            }

            const infoText = `╭━━━〔 🎵 *YOUTUBE AUDIO* 〕━━━╮\n` +
                             `┃ 📌 *Title:* ${video.title}\n` +
                             `┃ ⏱️ *Duration:* ${video.timestamp}\n` +
                             `┃ 👤 *Channel:* ${video.author.name}\n` +
                             `┃ 🔗 *URL:* ${video.url}\n` +
                             `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                             `⏳ *Downloading audio track, please wait...*`;

            await client.sendMessage(m.chat, {
                image: { url: video.thumbnail },
                caption: infoText
            }, { quoted: m });

            // Multi-Engine API Chain for YouTube MP3
            let downloadUrl = null;
            const apiEndpoints = [
                `https://api.vreden.web.id/api/ytmp3?url=${encodeURIComponent(video.url)}`,
                `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(video.url)}`,
                `https://api.agatz.xyz/api/ytmp3?url=${encodeURIComponent(video.url)}`,
                `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encodeURIComponent(video.url)}`
            ];

            for (const endpoint of apiEndpoints) {
                try {
                    const res = await axios.get(endpoint, {
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                        timeout: 15000
                    });
                    const d = res.data;
                    downloadUrl = d?.data?.dl || d?.result?.download?.url || d?.result?.dl || d?.data?.download?.url || d?.url;
                    if (downloadUrl) break;
                } catch {}
            }

            if (!downloadUrl) {
                return reply("❌ *Failed to fetch audio stream from servers. Please try again with another song or URL.*");
            }

            // Send audio file
            await client.sendMessage(m.chat, {
                audio: { url: downloadUrl },
                mimetype: 'audio/mp4',
                fileName: `${video.title}.mp3`
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });

        } catch (error) {
            console.error('[Play Plugin Error]:', error);
            reply(`❌ *Failed to download song:* ${error.message}`);
        }
    }
};
