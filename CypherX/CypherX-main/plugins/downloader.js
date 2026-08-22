const yts = require('yt-search');
const axios = require('axios');
const scraper = require('@vreden/youtube_scraper');

module.exports = {
    name: "downloader",
    alias: ["ytmp4", "video", "ytv", "fb", "facebook", "fbdl", "ytvideo", "dlvideo"],
    category: "download",
    description: "Download YouTube and Facebook videos as MP4 files",
    async execute(client, m, { text, prefix, command, reply }) {
        try {
            if (!text) {
                return reply(
                    `📥 *RED DRAGON VIDEO DOWNLOADER*\n\n` +
                    `*Usage Examples:*\n` +
                    `• *${prefix}${command} https://youtu.be/...* ➔ Download video from URL\n` +
                    `• *${prefix}${command} Alan Walker Faded* ➔ Search & download video\n` +
                    `• *${prefix}fb https://fb.watch/...* ➔ Download Facebook video\n`
                );
            }

            await client.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

            // 1. Facebook Downloader
            if (command === 'fb' || command === 'facebook' || command === 'fbdl' || text.includes('facebook.com') || text.includes('fb.watch')) {
                let fbUrl = null;
                const fbApis = [
                    `https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(text)}`,
                    `https://api.agatz.xyz/api/facebook?url=${encodeURIComponent(text)}`,
                    `https://api.vreden.web.id/api/fbdown?url=${encodeURIComponent(text)}`
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

                const fbBufferRes = await axios.get(fbUrl, {
                    responseType: 'arraybuffer',
                    timeout: 45000,
                    maxContentLength: 80 * 1024 * 1024
                });

                await client.sendMessage(m.chat, {
                    video: Buffer.from(fbBufferRes.data),
                    caption: "📥 *Facebook Video Downloaded by RED DRAGON OFC*",
                    mimetype: "video/mp4"
                }, { quoted: m });

                await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
                return;
            }

            // 2. YouTube Video Downloader
            let targetUrl = text;
            let videoTitle = "Video";
            let duration = "";
            let views = "";

            if (!text.startsWith('http')) {
                const searchResults = await yts(text);
                const first = searchResults.videos && searchResults.videos[0];
                if (first) {
                    targetUrl = first.url;
                    videoTitle = first.title;
                    duration = first.timestamp;
                    views = first.views;
                } else {
                    return reply(`❌ *No videos found matching "${text}".*`);
                }
            }

            let videoDownloadUrl = null;

            // Tier 1: Direct CDN Scraper via @vreden/youtube_scraper (SaveTube CDN)
            try {
                const scrapRes = await scraper.ytmp4(targetUrl, '360');
                if (scrapRes?.status && scrapRes?.download?.url) {
                    videoDownloadUrl = scrapRes.download.url;
                    if (scrapRes.metadata?.title) videoTitle = scrapRes.metadata.title;
                    if (scrapRes.metadata?.timestamp) duration = scrapRes.metadata.timestamp;
                }
            } catch (e) {
                console.error('[YTMP4 Scraper Exception]:', e.message);
            }

            // Tier 2: Multi-API Fallback Stream resolvers
            if (!videoDownloadUrl) {
                const ytApis = [
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
            }

            if (!videoDownloadUrl) {
                return reply("❌ *Failed to extract YouTube video stream. Please try with another link or title.*");
            }

            // Fetch video binary buffer
            const videoBufferRes = await axios.get(videoDownloadUrl, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 60000,
                maxContentLength: 90 * 1024 * 1024 // 90MB max buffer limit
            });

            const buffer = Buffer.from(videoBufferRes.data);

            await client.sendMessage(m.chat, {
                video: buffer,
                caption: `🎬 *${videoTitle}*\n${duration ? `⏱️ *Duration:* ${duration}\n` : ''}${views ? `👁️ *Views:* ${views}\n` : ''}\n📥 *Downloaded by RED DRAGON OFC*`,
                mimetype: "video/mp4"
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });

        } catch (error) {
            console.error('[Downloader Plugin Error]:', error);
            reply(`❌ *Failed to download video:* ${error.message}`);
        }
    }
};
