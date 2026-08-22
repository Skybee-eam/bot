const yts = require("yt-search");
const axios = require("axios");
const ytdl = require("@distube/ytdl-core");
const yt = require("@vreden/youtube_scraper");
const fs = require("fs");
const path = require("path");

const tmpDir = path.join(__dirname, "..", "tmp");
if (!fs.existsSync(tmpDir)) {
    try { fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
}

// High-reliability MP3 download — returns Buffer
async function getAudioBuffer(videoUrl) {
    // Method 1: vreden scraper → download URL → buffer
    try {
        const dl = await yt.ytmp3(videoUrl);
        if (dl?.status && dl?.download?.url) {
            const r = await axios.get(dl.download.url, {
                responseType: "arraybuffer",
                timeout: 60000,
                headers: { "User-Agent": "Mozilla/5.0" }
            });
            if (r.data && r.data.byteLength > 10000) {
                return Buffer.from(r.data);
            }
        }
    } catch (e) {
        console.log("[Play] vreden method failed:", e.message);
    }

    // Method 2: @distube/ytdl-core streaming into buffer
    try {
        const chunks = [];
        await new Promise((resolve, reject) => {
            const stream = ytdl(videoUrl, {
                filter: "audioonly",
                quality: "highestaudio",
                requestOptions: {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    }
                }
            });
            stream.on("data", chunk => chunks.push(chunk));
            stream.on("end", resolve);
            stream.on("error", reject);
            // Timeout after 60s
            setTimeout(() => reject(new Error("YTDL stream timeout")), 60000);
        });
        if (chunks.length > 0) {
            return Buffer.concat(chunks);
        }
    } catch (e) {
        console.log("[Play] ytdl method failed:", e.message);
    }

    // Method 3: fallback REST APIs
    const fallbacks = [
        `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(videoUrl)}`,
        `https://api.agatz.xyz/api/ytmp3?url=${encodeURIComponent(videoUrl)}`
    ];
    for (const api of fallbacks) {
        try {
            const res = await axios.get(api, { timeout: 12000 });
            const dlUrl = res.data?.data?.dl || res.data?.result?.download?.url;
            if (dlUrl) {
                const r = await axios.get(dlUrl, {
                    responseType: "arraybuffer",
                    timeout: 60000,
                    headers: { "User-Agent": "Mozilla/5.0" }
                });
                if (r.data && r.data.byteLength > 10000) {
                    return Buffer.from(r.data);
                }
            }
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
            return reply(`🎵 *Please provide a song title or YouTube link!*\n\n*Example:* \`${prefix || "."}${command || "play"} Shape of You\``);
        }

        let tempFile = null;

        try {
            await client.sendMessage(m.chat, { react: { text: "🔍", key: m.key } });

            let videoUrl = text.trim();
            let videoInfo = null;

            // Search if not a direct URL
            if (!text.includes("youtube.com") && !text.includes("youtu.be")) {
                const search = await yts(text);
                const video = search.videos?.[0];
                if (!video) {
                    return reply("❌ *No songs found. Try different keywords.*");
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
                try {
                    const meta = await yt.metadata(videoUrl);
                    videoInfo = {
                        title: meta?.title || "Audio Track",
                        author: meta?.channel?.name || "YouTube",
                        timestamp: meta?.timestamp || "N/A",
                        thumbnail: meta?.thumbnail || "https://i.imgur.com/2wzL9Zc.png",
                        url: videoUrl
                    };
                } catch {
                    videoInfo = { title: "Audio Track", author: "YouTube", timestamp: "N/A", thumbnail: "https://i.imgur.com/2wzL9Zc.png", url: videoUrl };
                }
            }

            // Send info card
            await client.sendMessage(m.chat, {
                image: { url: videoInfo.thumbnail },
                caption:
                    `╭━━━〔 🎵 *CYPHER-X MUSIC* 〕━━━╮\n` +
                    `│ 📌 *${videoInfo.title}*\n` +
                    `│ 👤 ${videoInfo.author}\n` +
                    `│ ⏱️ ${videoInfo.timestamp}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                    `_⏳ Downloading audio... please wait_`
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

            // Get audio buffer
            const audioBuffer = await getAudioBuffer(videoUrl);

            if (!audioBuffer || audioBuffer.length < 10000) {
                return reply("❌ *Failed to download audio. Try another song or paste the YouTube link directly.*");
            }

            // Write to temp file
            const safeTitle = (videoInfo.title || "song").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
            tempFile = path.join(tmpDir, `play_${Date.now()}_${safeTitle}.mp3`);
            fs.writeFileSync(tempFile, audioBuffer);
            const fileBuf = fs.readFileSync(tempFile);

            // KEY FIX: mimetype MUST be "audio/mpeg" for MP3 with ID3 tags
            await client.sendMessage(m.chat, {
                audio: fileBuf,
                mimetype: "audio/mpeg",
                ptt: false,
                fileName: `${safeTitle}.mp3`
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });

        } catch (error) {
            console.error("[Play Plugin Error]:", error.message);
            reply(`❌ *Play failed:* ${error.message}`);
        } finally {
            if (tempFile) {
                try { fs.unlinkSync(tempFile); } catch {}
            }
        }
    }
};
