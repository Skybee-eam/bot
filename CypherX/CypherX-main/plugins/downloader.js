const yts = require('yt-search');
const axios = require('axios');

module.exports = {
    name: "downloader",
    alias: ["ytmp4", "video", "ytv", "fb", "facebook", "fbdl"],
    category: "download",
    description: "Download YouTube and Facebook videos as MP4 files",
    async execute(client, m, { text, prefix, command, reply }) {
        try {
            if (!text) {
                return reply(`⚠️ *Please provide a video title or URL, e.g.:*\n${prefix}${command} https://youtube.com/watch?v=...`);
            }

            await client.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

            // 1. Facebook Downloader
            if (command === 'fb' || command === 'facebook' || command === 'fbdl' || text.includes('facebook.com') || text.includes('fb.watch')) {
                let fbUrl = null;
                const fbApis = [
                    `https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(text)}`,
                    `https://api.vreden.my.id/api/fbdl?url=${encodeURIComponent(text)}`,
                    `https://bk9.fun/download/fb?url=${encodeURIComponent(text)}`
                ];

                for (const api of fbApis) {
                    try {
                        const res = await axios.get(api, { timeout: 15000 });
                        fbUrl = res.data?.data?.urls?.[0]?.hd || res.data?.data?.urls?.[0]?.sd || res.data?.result?.video || res.data?.BK9?.hd || res.data?.BK9?.sd;
                        if (fbUrl) break;
                    } catch {}
                }

                if (!fbUrl) {
                    return reply("❌ *Failed to extract Facebook video link. Make sure the post is public.*");
                }

                await client.sendMessage(m.chat, {
                    video: { url: fbUrl },
                    caption: "📥 *Facebook Video Downloaded by RED DRAGON OFC*",
                    mimetype: "video/mp4"
                }, { quoted: m });

                await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
                return;
            }

            // 2. YouTube Video Downloader
            let targetUrl = text;
            let videoTitle = "YouTube Video";

            if (!text.startsWith('http')) {
                const searchResults = await yts(text);
                const first = searchResults.videos && searchResults.videos[0];
                if (first) {
                    targetUrl = first.url;
                    videoTitle = first.title;
                }
            }

            let videoDownloadUrl = null;
            const ytApis = [
                `https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(targetUrl)}`,
                `https://api.vreden.my.id/api/ytmp4?url=${encodeURIComponent(targetUrl)}`,
                `https://bk9.fun/download/ytmp4?url=${encodeURIComponent(targetUrl)}`
            ];

            for (const api of ytApis) {
                try {
                    const res = await axios.get(api, { timeout: 15000 });
                    videoDownloadUrl = res.data?.data?.dl || res.data?.result?.download?.url || res.data?.BK9?.downloadUrl || res.data?.result?.dl;
                    if (videoDownloadUrl) break;
                } catch {}
            }

            if (!videoDownloadUrl) {
                return reply("❌ *Failed to download YouTube video stream. Please try again.*");
            }

            await client.sendMessage(m.chat, {
                video: { url: videoDownloadUrl },
                caption: `🎬 *${videoTitle}*\n\n📥 *Downloaded by RED DRAGON OFC*`,
                mimetype: "video/mp4"
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });

        } catch (error) {
            console.error('[Downloader Plugin Error]:', error);
            reply(`❌ *Failed to download video:* ${error.message}`);
        }
    }
};
