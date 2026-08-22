const yts = require("yt-search");
const axios = require("axios");
const yt = require("@vreden/youtube_scraper");

// High-reliability audio download resolver
async function getAudioDownloadUrl(videoUrl) {
    // 1. Primary: @vreden/youtube_scraper (Fast & Direct CDN)
    try {
        const dl = await yt.ytmp3(videoUrl);
        if (dl && dl.status && dl.download?.url) {
            return dl.download.url;
        }
    } catch (e) {
        console.log("[Play] Primary scraper failed:", e.message);
    }

    // 2. Secondary: Fallback endpoints
    const fallbackApis = [
        async () => {
            const res = await axios.get(`https://api.vreden.web.id/api/ytmp3?url=${encodeURIComponent(videoUrl)}`, { timeout: 10000 });
            return res.data?.result?.download?.url || res.data?.result?.url || null;
        },
        async () => {
            const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encodeURIComponent(videoUrl)}`, { timeout: 10000 });
            return res.data?.url || res.data?.download?.url || null;
        }
    ];

    for (const fetchServer of fallbackApis) {
        try {
            const url = await fetchServer();
            if (url) return url;
        } catch {}
    }

    return null;
}

module.exports = {
    name: "play",
    alias: ["song", "music", "ytplay", "audio"],
    category: "downloader",
    description: "Search and download high-quality audio from YouTube",
    async execute(client, m, { text, prefix, command, reply }) {
        if (!text) {
            return reply(`🎵 *Please provide a song title or YouTube link!*\n\n*Example:* \`${prefix || '.'}${command || 'play'} Shape of You\``);
        }

        try {
            await client.sendMessage(m.chat, { react: { text: "🔍", key: m.key } });

            let videoUrl = text.trim();
            let videoInfo = null;

            if (!text.includes("youtube.com") && !text.includes("youtu.be")) {
                const search = await yts(text);
                const video = search.videos && search.videos[0];
                if (!video) {
                    return reply("❌ *No songs found for your query. Please try different keywords.*");
                }
                
                videoUrl = video.url;
                videoInfo = {
                    title: video.title,
                    author: video.author?.name || "YouTube Artist",
                    timestamp: video.timestamp || "N/A",
                    thumbnail: video.thumbnail || video.image || "https://i.imgur.com/2wzL9Zc.png",
                    url: video.url
                };
            } else {
                const search = await yts(text);
                const first = search.videos && search.videos[0];
                videoInfo = {
                    title: first?.title || "YouTube Audio Track",
                    author: first?.author?.name || "YouTube",
                    timestamp: first?.timestamp || "N/A",
                    thumbnail: first?.thumbnail || first?.image || "https://i.imgur.com/2wzL9Zc.png",
                    url: videoUrl
                };
            }

            // Send track info card with thumbnail
            await client.sendMessage(m.chat, {
                image: { url: videoInfo.thumbnail },
                caption: `╭━━━〔 🎵 *CYPHER-X MUSIC* 〕━━━╮\n` +
                         `│ 📌 *Title:* ${videoInfo.title}\n` +
                         `│ 👤 *Artist:* ${videoInfo.author}\n` +
                         `│ ⏱️ *Duration:* ${videoInfo.timestamp}\n` +
                         `│ 🔗 *URL:* ${videoInfo.url}\n` +
                         `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                         `_⏳ Downloading high quality audio stream..._`
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

            // Fetch stream download URL
            const downloadUrl = await getAudioDownloadUrl(videoUrl);

            if (!downloadUrl) {
                return reply("❌ *Unable to download this track right now. Please try again with another song or link.*");
            }

            // Download audio buffer to ensure 100% playable file delivery
            let audioPayload;
            try {
                const audioRes = await axios.get(downloadUrl, {
                    responseType: 'arraybuffer',
                    timeout: 45000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                audioPayload = Buffer.from(audioRes.data);
            } catch (err) {
                console.log("[Play] Buffer download error, falling back to direct URL:", err.message);
                audioPayload = { url: downloadUrl };
            }

            // Send audio track to WhatsApp chat with valid audio/mpeg format
            await client.sendMessage(m.chat, {
                audio: audioPayload,
                mimetype: "audio/mpeg",
                ptt: false,
                fileName: `${videoInfo.title}.mp3`,
                contextInfo: {
                    externalAdReply: {
                        title: videoInfo.title,
                        body: `By ${videoInfo.author} • CypherX Music`,
                        thumbnailUrl: videoInfo.thumbnail,
                        sourceUrl: videoInfo.url,
                        mediaType: 2,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });

        } catch (error) {
            console.error("[Play Plugin Error]:", error);
            reply(`❌ *Play command failed:* ${error.message}`);
        }
    }
};


