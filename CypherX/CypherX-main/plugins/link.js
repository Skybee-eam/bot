/**
 * 🐝 Skybee Bot Store Homepage Link Plugin
 * Sends the official homepage link for users to pair and activate their 24/7 bot
 */

module.exports = {
    name: "link",
    alias: ["store", "join", "pair", "getbot", "botlink", "storelink", "hostbot", "connectbot", "site", "website"],
    category: "general",
    description: "Sends the official Skybee Bot Homepage link",
    async execute(client, m, { args, text, prefix, command, reply }) {
        try {
            const homepageUrl = `https://bot-z47t.onrender.com`;

            const linkMsg = `╭━━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━━╮\n` +
                            `┃ ✨ *OFFICIAL BOT ACTIVATION PORTAL*\n` +
                            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                            `🚀 *Activate your 24/7 WhatsApp Bot here:*\n` +
                            `👉 ${homepageUrl}\n\n` +
                            `💡 _Open the link to generate your 8-digit Pairing Code or QR Code!_`;

            await reply(linkMsg);
        } catch (error) {
            console.error('[Link Plugin Error]:', error);
            reply(`❌ *Failed to send homepage link:* ${error.message}`);
        }
    }
};
