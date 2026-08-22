const yts = require("yt-search");
const axios = require("axios");
const ytdl = require("@distube/ytdl-core");
const yt = require("@vreden/youtube_scraper");
const fs = require("fs");
const path = require("path");
const { convertAudioToM4A, tmpDir } = require("../src/Core/mediaConverter");

/**
 * Download raw audio bytes from YouTube.
 * Returns a Buffer of the raw download (MP3/WebM/etc).
 */
async function downloadRawAudio(videoUrl) {
    // Method 1: vreden CDN → MP3 buffer
    try {
        const dl = await yt.ytmp3(videoUrl);
        if (dl?.status && dl?.download?.url) {
            const r = await axios.get(dl.download.url, {
                responseType: "arraybuffer",
                timeout: 60000,
                headers: { "User-Agent": "Mozilla/5.0" }
            });
            if (r.data?.byteLength > 10000) return Buffer.from(r.data);
        }
    } catch (e) {
        console.log("[Play] vreden cdnfailed:", e.message);
    }

    // Method 2: @distube/ytdl-core audio stream
    try {
        const chunks = [];
        await new Promise((resolve, reject) => {
            const stream = ytdl(videoUrl, {
                filter: "audioonly",
                quality: "highestaudio",
                requestOptions: {
                    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
                }
            });
            stream.on("data", c => chunks.push(c));
            stream.on("end", resolve);
            stream.on("error", reject);
            setTimeout(() => reject(new Error("ytdl timeout")), 90000);
        });
        if (chunks.length) return Buffer.concat(chunks);
    } catch (e) {
        console.log("[Play] ytdl failed:", e.message);
    }

    // Method 3: fallback REST APIs
    for (const api of [
        `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(videoUrl)}`,
        `https://api.agatz.xyz/api/ytmp3?url=${encodeURIComponent(videoUrl)}`
    ]) {
        try {
            const res = await axios.get(api, { timeout: 12000 });
            const dlUrl = res.data?.data?.dl || res.data?.result?.download?.url;
            if (dlUrl) {
                const r = await axios.get(dlUrl, {
                    responseType: "arraybuffer",
                    timeout: 60000,
                    headers: { "User-Agent": "Mozilla/5.0" }
                });
                if (r.data?.byteLength > 10000) return Buffer.from(r.data);
            }
        } catch {}
    }

    return null;
}

module.exports = {
    name: "play",
    alias: ["song", "music", "ytplay", "audio"],
    category: "downloader",
    description: "Search and download playable audio from YouTube (iOS + Android compatible)",
    async execute(client, m, { text, prefix, command, reply }) {
        if (!text) {
            return reply(`🎵 *Provide a song title or YouTube link!*\n\nExample: \`${prefix || "."}play Shape of You\``);
        }

        const tempFiles = [];

        try {
            await client.sendMessage(m.chat, { react: { text: "🔍", key: m.key } });

            // ── Search ───────────────────────────────────────────────
            let videoUrl = text.trim();
            let videoInfo = null;

            if (!text.includes("youtube.com") && !text.includes("youtu.be")) {
                const search = await yts(text);
                const video = search.videos?.[0];
                if (!video) return reply("❌ *No songs found. Try different keywords.*");
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
                const v = search.videos?.[0];
                videoInfo = {
                    title: v?.title || "Audio Track",
                    author: v?.author?.name || "YouTube",
                    timestamp: v?.timestamp || "N/A",
                    thumbnail: v?.thumbnail || v?.image || "https://i.imgur.com/2wzL9Zc.png",
                    url: videoUrl
                };
            }

            // ── Info card ────────────────────────────────────────────
            await client.sendMessage(m.chat, {
                image: { url: videoInfo.thumbnail },
                caption:
                    `╭━━━〔 🎵 *CYPHER-X MUSIC* 〕━━━╮\n` +
                    `│ 📌 *${videoInfo.title}*\n` +
                    `│ 👤 ${videoInfo.author}\n` +
                    `│ ⏱️ ${videoInfo.timestamp}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                    `_⏳ Converting to AAC for iOS/Android playback..._`
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

            // ── Download raw audio ───────────────────────────────────
            const rawBuffer = await downloadRawAudio(videoUrl);
            if (!rawBuffer || rawBuffer.length < 10000) {
                return reply("❌ *Failed to download audio. Try a different song.*");
            }

            // ── Save raw file ────────────────────────────────────────
            const safeTitle = (videoInfo.title || "song").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
            const rawPath = path.join(tmpDir, `play_raw_${Date.now()}_${safeTitle}.mp3`);
            fs.writeFileSync(rawPath, rawBuffer);
            tempFiles.push(rawPath);

            // ── Transcode to AAC/M4A (works on iOS AND Android) ─────
            let m4aPath;
            try {
                m4aPath = await convertAudioToM4A(rawPath);
                tempFiles.push(m4aPath);
            } catch (ffErr) {
                console.log("[Play] ffmpeg convert failed, sending raw:", ffErr.message);
                // Fallback: send raw MP3 with audio/mpeg
                await client.sendMessage(m.chat, {
                    audio: fs.readFileSync(rawPath),
                    mimetype: "audio/mpeg",
                    ptt: false,
                    fileName: `${safeTitle}.mp3`
                }, { quoted: m });
                await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
                return;
            }

            // ── Send M4A — plays natively on iOS & Android WhatsApp ──
            await client.sendMessage(m.chat, {
                audio: fs.readFileSync(m4aPath),
                mimetype: "audio/mp4",   // M4A container with AAC codec
                ptt: false,
                fileName: `${safeTitle}.m4a`
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });

        } catch (error) {
            console.error("[Play Plugin Error]:", error.message);
            reply(`❌ *Play failed:* ${error.message}`);
        } finally {
            for (const f of tempFiles) {
                try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
            }
        }
    }
};
