const yts = require("yt-search");
const axios = require("axios");

// Helper function with multiple API server fallbacks
async function getAudioDownloadUrl(videoUrl) {
    const servers = [
        // Server 1 (DavidCyril Tech API)
        async () => {
            const res = await axios.get(`https://api.davidcyriltech.my.id/download/ytmp3?url=${encodeURIComponent(videoUrl)}`, { timeout: 10000 });
            return res.data?.result?.download_url || res.data?.result?.url || null;
        },
        // Server 2 (Vreden API)
        async () => {
            const res = await axios.get(`https://api.vreden.my.id/api/ytmp3?url=${encodeURIComponent(videoUrl)}`, { timeout: 10000 });
            return res.data?.result?.download?.url || res.data?.result?.url || null;
        },
        // Server 3 (Siputzx API)
        async () => {
            const res = await axios.get(`https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(videoUrl)}`, { timeout: 10000 });
            return res.data?.data?.dl || res.data?.result?.download_url || null;
        },
        // Server 4 (Gifted API)
        async () => {
            const res = await axios.get(`https://api.giftedtech.web.id/api/download/ytmp3?apikey=gifted&url=${encodeURIComponent(videoUrl)}`, { timeout: 10000 });
            return res.data?.result?.download_url || null;
        }
    ];

    for (const fetchServer of servers) {
        try {
            const downloadUrl = await fetchServer();
            if (downloadUrl) return downloadUrl;
        } catch (e) {
            // Continue to next server if one fails
            continue;
        }
    }
    return null;
}

module.exports = {
    name: "play",
    alias: ["song", "music", "ytplay"],
    category: "downloader",
    description: "Search and download audio from YouTube with multi-server fallback",
    async execute(client, m, { text }) {
        if (!text) {
            return m.reply("Please provide a song title or YouTube link.\n*Example:* `.play Shape of You`");
        }

        try {
            await m.reply("🔍 *Searching YouTube...*");

            let videoUrl = text;
            let videoInfo = null;

            if (!text.includes("youtube.com") && !text.includes("youtu.be")) {
                const search = await yts(text);
                const video = search.videos[0];
                if (!video) return m.reply("No results found for that query.");
                
                videoUrl = video.url;
                videoInfo = video;
            } else {
                const search = await yts(text);
                videoInfo = search.videos[0] || {
                    title: "YouTube Audio",
                    author: { name: "YouTube" },
                    timestamp: "N/A",
                    thumbnail: "https://i.imgur.com/2wzL9Zc.png",
                    url: text
                };
            }

            // Send track info
            await client.sendMessage(m.chat, {
                image: { url: videoInfo.thumbnail },
                caption: `🎵 *Title:* ${videoInfo.title}\n👤 *Artist:* ${videoInfo.author.name}\n⏱️ *Duration:* ${videoInfo.timestamp}\n🔗 *Link:* ${videoInfo.url}\n\n_⏳ Downloading audio stream, please wait..._`
            }, { quoted: m });

            // Fetch stream link across fallback servers
            const downloadUrl = await getAudioDownloadUrl(videoUrl);

            if (!downloadUrl) {
                return m.reply("❌ *All audio download servers are currently busy or unavailable. Please try again shortly.*");
            }

            // Dispatch audio file
            await client.sendMessage(m.chat, {
                audio: { url: downloadUrl },
                mimetype: "audio/mp4",
                fileName: `${videoInfo.title}.mp3`,
                contextInfo: {
                    externalAdReply: {
                        title: videoInfo.title,
                        body: videoInfo.author.name,
                        thumbnailUrl: videoInfo.thumbnail,
                        sourceUrl: videoInfo.url,
                        mediaType: 2,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: m });

        } catch (error) {
            console.error("Play Execution Error:", error);
            await m.reply("❌ An error occurred while processing the command.");
        }
    }
};
