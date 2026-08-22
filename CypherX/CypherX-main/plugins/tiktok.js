const axios = require('axios');

module.exports = {
    name: "tiktok",
    alias: ["tt", "ttdl", "tiktokdl"],
    category: "download",
    description: "Download TikTok video without watermark",
    async execute(client, m, { text, prefix, command, reply }) {
        try {
            if (!text || !text.includes('tiktok.com')) {
                return reply(`⚠️ *Please provide a valid TikTok link, e.g.:*\n${prefix}${command} https://www.tiktok.com/@user/video/...`);
            }

            await client.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

            let videoUrl = null;
            let title = "TikTok Video";
            const ttApis = [
                `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(text)}`,
                `https://api.vreden.my.id/api/tiktok?url=${encodeURIComponent(text)}`,
                `https://bk9.fun/download/tiktok?url=${encodeURIComponent(text)}`
            ];

            for (const api of ttApis) {
                try {
                    const res = await axios.get(api, { timeout: 15000 });
                    videoUrl = res.data?.data?.urls?.[0] || res.data?.data?.play || res.data?.result?.video || res.data?.BK9?.nowm;
                    title = res.data?.data?.title || res.data?.result?.title || title;
                    if (videoUrl) break;
                } catch {}
            }

            if (!videoUrl) {
                return reply("❌ *Failed to extract TikTok video. Please check the URL and try again.*");
            }

            await client.sendMessage(m.chat, {
                video: { url: videoUrl },
                caption: `📱 *${title}*\n\n🔓 *Watermark removed by RED DRAGON OFC*`,
                mimetype: "video/mp4"
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });

        } catch (error) {
            console.error('[TikTok Plugin Error]:', error);
            reply(`❌ *Failed to download TikTok video:* ${error.message}`);
        }
    }
};
