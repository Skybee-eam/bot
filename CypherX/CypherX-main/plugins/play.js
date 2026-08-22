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

            // Fetch MP3 download URL from public APIs
            let downloadUrl = null;
            const apiEndpoints = [
                `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(video.url)}`,
                `https://api.vreden.my.id/api/ytmp3?url=${encodeURIComponent(video.url)}`,
                `https://bk9.fun/download/ytmp3?url=${encodeURIComponent(video.url)}`
            ];

            for (const endpoint of apiEndpoints) {
                try {
                    const res = await axios.get(endpoint, { timeout: 15000 });
                    if (res.data?.data?.dl || res.data?.result?.download?.url || res.data?.BK9?.downloadUrl || res.data?.result?.dl) {
                        downloadUrl = res.data?.data?.dl || res.data?.result?.download?.url || res.data?.BK9?.downloadUrl || res.data?.result?.dl;
                        break;
                    }
                } catch {}
            }

            if (!downloadUrl) {
                return reply("❌ *Failed to fetch audio stream from servers. Please try again.*");
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
