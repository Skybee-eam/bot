const fs = require('fs');
const path = require('path');

module.exports = {
    name: "session",
    alias: ["getsession", "sessionid", "mysession", "id"],
    category: "general",
    description: "Get your portable WhatsApp Bot Session ID for instant backup & reconnection",
    async execute(client, m, { args, text, prefix, command }) {
        if (!m.isOwner) {
            return client.sendMessage(m.chat, { text: "⚠️ Only the bot owner can view the session ID for security reasons." }, { quoted: m });
        }

        try {
            // Locate session directory
            const possibleDirs = [
                process.env.BOT_SESSION_DIR,
                path.join(__dirname, '..', 'session'),
                path.join(__dirname, '..', 'src', 'Session')
            ];

            let credsPath = null;
            for (const d of possibleDirs) {
                if (d && fs.existsSync(path.join(d, 'creds.json'))) {
                    credsPath = path.join(d, 'creds.json');
                    break;
                }
            }

            if (!credsPath) {
                return client.sendMessage(m.chat, { 
                    text: "❌ Could not locate credentials file on the server." 
                }, { quoted: m });
            }

            const credsData = fs.readFileSync(credsPath, 'utf8');
            const base64 = Buffer.from(credsData).toString('base64');
            const sessionId = `SKYBEE~${base64}`;

            // Send instructions first
            await client.sendMessage(m.chat, {
                text: `🐝 *SKYBEE BOT RECOVERY SESSION ID* 🐝\n\n` +
                      `💾 *Save this Session ID safely!*\n` +
                      `If the bot crashes or server restarts, paste this Session ID on the website to reconnect instantly without scanning or linking again.\n\n` +
                      `⚠️ *Keep it secret:* Anyone with this ID can access your bot session.`
            }, { quoted: m });

            // Send the raw Session ID for 1-tap easy copy
            await client.sendMessage(m.chat, {
                text: sessionId
            });

        } catch (err) {
            console.error('[PLUGIN SESSION ERROR]:', err);
            await client.sendMessage(m.chat, { 
                text: `❌ Error generating Session ID: ${err.message}` 
            }, { quoted: m });
        }
    }
};
