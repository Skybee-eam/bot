const yts = require('yt-search');
const axios = require('axios');

module.exports = {
    name: "play",
    alias: ["ytmp3", "song", "music", "audio"],
    category: "download",
    description: "Searches YouTube via yt-search, extracts audio stream, and delivers as MP3 with interactive player preview",
    async execute(client, m, { text, prefix, command, reply }) {
        try {
            if (!text) {
                return reply(`⚠️ *Please provide a song title or YouTube link, e.g.:*\n${prefix}${command} Alan Walker Faded`);
            }

            await client.sendMessage(m.chat, { react: { text: "🔍", key: m.key } });

            // 1. YouTube Query Search (yt-search)
            const search = await yts(text);
            const video = search.videos && search.videos[0];
            if (!video) {
                return reply("❌ *No YouTube tracks found matching your query.*");
            }

            // 2. Preview & Status Dispatch Card
            const previewCard = `╭━━━〔 🎵 *YOUTUBE MUSIC* 〕━━━╮\n` +
                                `┃ 📌 *Title:* ${video.title}\n` +
                                `┃ 👤 *Artist:* ${video.author.name}\n` +
                                `┃ ⏱️ *Duration:* ${video.timestamp}\n` +
                                `┃ 👁️ *Views:* ${video.views ? video.views.toLocaleString() : 'N/A'}\n` +
                                `┃ 🔗 *URL:* ${video.url}\n` +
                                `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                                `⏳ *Downloading audio stream, please wait...*`;

            await client.sendMessage(m.chat, {
                image: { url: video.thumbnail },
                caption: previewCard
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

            // 3. Stream Extraction via Downloader APIs (Multi-Engine Chain)
            let downloadUrl = null;
            const extractionApis = [
                `https://api.vreden.web.id/api/ytmp3?url=${encodeURIComponent(video.url)}`,
                `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(video.url)}`,
                `https://api.giftedtech.web.id/api/download/ytmp3?apikey=gifted&url=${encodeURIComponent(video.url)}`,
                `https://api.agatz.xyz/api/ytmp3?url=${encodeURIComponent(video.url)}`,
                `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encodeURIComponent(video.url)}`
            ];

            for (const apiUrl of extractionApis) {
                try {
                    const response = await axios.get(apiUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                        timeout: 15000
                    });
                    const data = response.data;
                    downloadUrl = data?.data?.dl || data?.result?.download?.url || data?.result?.dl || data?.data?.download?.url || data?.download_url || data?.url;
                    if (downloadUrl) break;
                } catch {}
            }

            if (!downloadUrl) {
                return reply("❌ *Failed to decrypt YouTube audio stream from servers. Please try another song or link.*");
            }

            // 4. Audio Encoding & WhatsApp Dispatch (Baileys Player Widget)
            await client.sendMessage(m.chat, {
                audio: { url: downloadUrl },
                mimetype: "audio/mp4",
                fileName: `${video.title}.mp3`,
                contextInfo: {
                    externalAdReply: {
                        title: video.title,
                        body: video.author.name,
                        thumbnailUrl: video.thumbnail,
                        sourceUrl: video.url,
                        mediaType: 2,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });

        } catch (error) {
            console.error('[Play Plugin Error]:', error);
            reply(`❌ *Failed to play audio:* ${error.message}`);
        }
    }
};
