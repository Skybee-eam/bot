const axios = require('axios');

module.exports = {
    name: "ig",
    alias: ["instagram", "reel", "igdl"],
    category: "download",
    description: "Download Instagram Reels and Posts",
    async execute(client, m, { text, prefix, command, reply }) {
        try {
            if (!text || (!text.includes('instagram.com') && !text.includes('instagr.am'))) {
                return reply(`⚠️ *Please provide an Instagram post or reel link, e.g.:*\n${prefix}${command} https://www.instagram.com/reel/...`);
            }

            await client.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

            let mediaUrl = null;
            const igApis = [
                `https://api.vreden.web.id/api/instagram?url=${encodeURIComponent(text)}`,
                `https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(text)}`,
                `https://api.agatz.xyz/api/instagram?url=${encodeURIComponent(text)}`
            ];

            for (const api of igApis) {
                try {
                    const res = await axios.get(api, {
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                        timeout: 15000
                    });
                    const d = res.data;
                    const items = d?.data || d?.result;
                    if (Array.isArray(items) && items[0]) {
                        mediaUrl = items[0].url || items[0].downloadUrl || items[0];
                    } else if (typeof items === 'object') {
                        mediaUrl = items?.url || items?.video || items?.image;
                    }
                    if (mediaUrl) break;
                } catch {}
            }

            if (!mediaUrl) {
                return reply("❌ *Failed to extract Instagram media. Make sure the account/post is public.*");
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
