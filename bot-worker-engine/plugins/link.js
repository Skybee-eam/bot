/**
 * 🐝 Skybee Bot Store Activation & Referral Link Plugin
 * Sends the official Render Cloud link for users to pair and host their own 24/7 bot
 */

module.exports = {
    name: "link",
    alias: ["store", "join", "pair", "getbot", "botlink", "storelink", "hostbot", "connectbot"],
    category: "general",
    description: "Sends the official Skybee Bot Activation Store link to pair or join the cloud",
    async execute(client, m, { args, text, prefix, command, reply }) {
        try {
            const senderName = m.pushName || 'Friend';
            const cleanRef = encodeURIComponent(senderName);
            const storeUrl = `https://bot-z47t.onrender.com/store`;
            const refStoreUrl = `https://bot-z47t.onrender.com/store?ref=${cleanRef}`;

            const linkMsg = `╭━━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 𝐒𝐓𝐎𝐑𝐄 〕━━━━╮\n` +
                            `┃ ✨ *HOST YOUR OWN 24/7 WHATSAPP BOT*\n` +
                            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                            `🚀 *Activate Your Bot Now:*\n` +
                            `👉 *Store Link:* ${storeUrl}\n\n` +
                            `🤝 *Personalized Referral Link:*\n` +
                            `👉 ${refStoreUrl}\n\n` +
                            `💡 _Share the link with friends so they can activate their own bot too!_`;

            await client.sendMessage(m.chat, {
                text: linkMsg
            }, { quoted: m });
        } catch (error) {
            console.error('[Link Plugin Error]:', error);
            reply(`❌ *Failed to generate store link:* ${error.message}`);
        }
    }
};
