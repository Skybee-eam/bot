const axios = require('axios');

module.exports = {
    name: "tiktok",
    alias: ["tt", "ttdl", "tiktokdl"],
    category: "download",
    description: "Download TikTok video without watermark using TikWM",
    async execute(client, m, { text, prefix, command, reply }) {
        try {
            if (!text || (!text.includes('tiktok.com') && !text.includes('vt.tiktok.com'))) {
                return reply(`⚠️ *Please provide a valid TikTok link, e.g.:*\n${prefix}${command} https://vt.tiktok.com/...`);
            }

            await client.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

            let videoUrl = null;
            let title = "TikTok Video";
            let author = "TikTok Creator";

            // 1. Primary: Official TikWM API
            try {
                const res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 15000
                });
                if (res.data && res.data.code === 0 && res.data.data) {
                    videoUrl = res.data.data.play || res.data.data.wmplay || res.data.data.hdplay;
                    title = res.data.data.title || title;
                    author = res.data.data.author?.nickname || author;
                }
            } catch (err) {
                console.log('[TikTok] TikWM note:', err.message);
            }

            // 2. Fallbacks
            if (!videoUrl) {
                const fallbacks = [
                    `https://api.vreden.web.id/api/tiktok?url=${encodeURIComponent(text)}`,
                    `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(text)}`
                ];
                for (const fb of fallbacks) {
                    try {
                        const r = await axios.get(fb, { timeout: 10000 });
                        videoUrl = r.data?.data?.urls?.[0] || r.data?.data?.play || r.data?.result?.video;
                        if (videoUrl) break;
                    } catch {}
                }
            }

            if (!videoUrl) {
                return reply("❌ *Failed to extract TikTok video. Please check the URL and try again.*");
            }

            // Fetch video stream and send to WhatsApp
            await client.sendMessage(m.chat, {
                video: { url: videoUrl },
                caption: `📱 *${title}*\n👤 *Creator:* ${author}\n\n🔓 *Watermark removed by SKYBEE BOT*`,
                mimetype: "video/mp4"
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });

        } catch (error) {
            console.error('[TikTok Plugin Error]:', error);
            reply(`❌ *Failed to download TikTok video:* ${error.message}`);
        }
    }
};
