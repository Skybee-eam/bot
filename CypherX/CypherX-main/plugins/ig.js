const axios = require('axios');

module.exports = {
    name: "ig",
    alias: ["instagram", "reel", "igdl"],
    category: "download",
    description: "Download Instagram Reels and Posts",
    async execute(client, m, { text, prefix, command, reply }) {
        try {
            if (!text || !text.includes('instagram.com')) {
                return reply(`⚠️ *Please provide an Instagram post or reel link, e.g.:*\n${prefix}${command} https://www.instagram.com/reel/...`);
            }

            await client.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

            let mediaUrl = null;
            let isImage = false;
            const igApis = [
                `https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(text)}`,
                `https://api.vreden.my.id/api/igdownload?url=${encodeURIComponent(text)}`,
                `https://bk9.fun/download/ig?url=${encodeURIComponent(text)}`
            ];

            for (const api of igApis) {
                try {
                    const res = await axios.get(api, { timeout: 15000 });
                    const items = res.data?.data || res.data?.result || res.data?.BK9;
                    if (Array.isArray(items) && items[0]) {
                        mediaUrl = items[0].url || items[0].downloadUrl || items[0];
                    } else if (typeof items === 'object') {
                        mediaUrl = items.url || items.video || items.image;
                    }
                    if (mediaUrl) break;
                } catch {}
            }

            if (!mediaUrl) {
                return reply("❌ *Failed to extract Instagram media. Make sure the account is public.*");
            }

            if (mediaUrl.includes('.jpg') || mediaUrl.includes('.png') || mediaUrl.includes('.webp')) {
                await client.sendMessage(m.chat, {
                    image: { url: mediaUrl },
                    caption: "📸 *Instagram Post Downloaded by RED DRAGON OFC*"
                }, { quoted: m });
            } else {
                await client.sendMessage(m.chat, {
                    video: { url: mediaUrl },
                    caption: "🎬 *Instagram Reel Downloaded by RED DRAGON OFC*",
                    mimetype: "video/mp4"
                }, { quoted: m });
            }

            await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });

        } catch (error) {
            console.error('[IG Plugin Error]:', error);
            reply(`❌ *Failed to download Instagram media:* ${error.message}`);
        }
    }
};
