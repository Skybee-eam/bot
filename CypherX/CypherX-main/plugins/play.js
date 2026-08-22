const yts = require("yt-search");
const axios = require("axios");
const yt = require("@vreden/youtube_scraper");
const fs = require("fs");
const path = require("path");

const tmpDir = path.join(__dirname, "..", "tmp");
if (!fs.existsSync(tmpDir)) {
    try { fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
}

// High-reliability audio download resolver
async function getAudioDownloadUrl(videoUrl) {
    // 1. Primary: @vreden/youtube_scraper (Fast & Direct CDN)
    try {
        const dl = await yt.ytmp3(videoUrl);
        if (dl && dl.status && dl.download?.url) {
            return dl.download.url;
        }
    } catch (e) {
        console.log("[Play] Primary scraper note:", e.message);
    }

    // 2. Secondary: Fallback endpoints
    const fallbackApis = [
        async () => {
            const res = await axios.get(`https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(videoUrl)}`, { timeout: 12000 });
            return res.data?.data?.dl || res.data?.result?.download?.url || res.data?.data?.download?.url || null;
        },
        async () => {
            const res = await axios.get(`https://api.agatz.xyz/api/ytmp3?url=${encodeURIComponent(videoUrl)}`, { timeout: 12000 });
            return res.data?.data?.dl || res.data?.result?.url || null;
        },
        async () => {
            const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encodeURIComponent(videoUrl)}`, { timeout: 12000 });
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
    description: "Search and download playable high-quality audio from YouTube",
    async execute(client, m, { text, prefix, command, reply }) {
        if (!text) {
            return reply(`🎵 *Please provide a song title or YouTube link!*\n\n*Example:* \`${prefix || '.'}${command || 'play'} Shape of You\``);
        }

        let tempFile = null;

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

            // Send track info card with externalAdReply preview
            await client.sendMessage(m.chat, {
                image: { url: videoInfo.thumbnail },
                caption: `╭━━━〔 🎵 *CYPHER-X MUSIC* 〕━━━╮\n` +
                         `│ 📌 *Title:* ${videoInfo.title}\n` +
                         `│ 👤 *Artist:* ${videoInfo.author}\n` +
                         `│ ⏱️ *Duration:* ${videoInfo.timestamp}\n` +
                         `│ 🔗 *URL:* ${videoInfo.url}\n` +
                         `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                         `_⏳ Downloading playable audio stream..._`,
                contextInfo: {
                    externalAdReply: {
                        title: videoInfo.title,
                        body: `By ${videoInfo.author} • CypherX Music`,
                        thumbnailUrl: videoInfo.thumbnail,
                        sourceUrl: videoInfo.url,
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

            // Fetch stream download URL
            const downloadUrl = await getAudioDownloadUrl(videoUrl);

            if (!downloadUrl) {
                return reply("❌ *Unable to download this track right now. Please try again with another song or link.*");
            }

            // Download MP3 binary stream
            const audioRes = await axios.get(downloadUrl, {
                responseType: 'arraybuffer',
                timeout: 50000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const buffer = Buffer.from(audioRes.data);

            // Write to temp file to ensure complete stream integrity for WhatsApp
            const safeTitle = (videoInfo.title || 'song').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
            tempFile = path.join(tmpDir, `audio_${Date.now()}_${safeTitle}.mp3`);
            fs.writeFileSync(tempFile, buffer);

            // Send clean audio payload (mimetype audio/mp4 with ptt: false is the standard for WhatsApp in-app playable media)
            await client.sendMessage(m.chat, {
                audio: fs.readFileSync(tempFile),
                mimetype: "audio/mp4",
                ptt: false,
                fileName: `${safeTitle}.mp3`
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });

        } catch (error) {
            console.error("[Play Plugin Error]:", error);
            reply(`❌ *Play command failed:* ${error.message}`);
        } finally {
            if (tempFile && fs.existsSync(tempFile)) {
                try { fs.unlinkSync(tempFile); } catch {}
            }
        }
    }
};
