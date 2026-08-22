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
                    `https://api.vreden.web.id/api/fbdown?url=${encodeURIComponent(text)}`,
                    `https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(text)}`,
                    `https://api.agatz.xyz/api/facebook?url=${encodeURIComponent(text)}`
                ];

                for (const api of fbApis) {
                    try {
                        const res = await axios.get(api, {
                            headers: { 'User-Agent': 'Mozilla/5.0' },
                            timeout: 15000
                        });
                        const d = res.data;
                        fbUrl = d?.data?.urls?.[0]?.hd || d?.data?.urls?.[0]?.sd || d?.result?.video || d?.data?.hd || d?.data?.sd || d?.url;
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
                `https://api.vreden.web.id/api/ytmp4?url=${encodeURIComponent(targetUrl)}`,
                `https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(targetUrl)}`,
                `https://api.agatz.xyz/api/ytmp4?url=${encodeURIComponent(targetUrl)}`,
                `https://api.ryzendesu.vip/api/downloader/ytmp4?url=${encodeURIComponent(targetUrl)}`
            ];

            for (const api of ytApis) {
                try {
                    const res = await axios.get(api, {
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                        timeout: 15000
                    });
                    const d = res.data;
                    videoDownloadUrl = d?.data?.dl || d?.result?.download?.url || d?.result?.dl || d?.data?.download?.url || d?.url;
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
