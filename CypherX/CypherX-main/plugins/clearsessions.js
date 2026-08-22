const fs = require('fs');
const path = require('path');

module.exports = {
    name: "clearsessions",
    alias: ["cleansessions", "purgesessions", "sessionclean"],
    category: "owner",
    description: "Cleans up inactive peer sessions and pre-keys older than 2 days",
    async execute(client, m, { prefix, command, reply, isOwner }) {
        try {
            const authDir = path.join(__dirname, '..', 'session');
            if (!fs.existsSync(authDir)) {
                return reply("❌ *Session directory not found.*");
            }

            const now = Date.now();
            const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
            const files = fs.readdirSync(authDir);
            let purgedCount = 0;
            let activeCount = 0;

            for (const file of files) {
                if (file === 'creds.json' || file.startsWith('app-state-sync-key')) {
                    activeCount++;
                    continue;
                }

                const filePath = path.join(authDir, file);
                try {
                    const stats = fs.statSync(filePath);
                    if (now - stats.mtimeMs > TWO_DAYS_MS) {
                        fs.unlinkSync(filePath);
                        purgedCount++;
                    } else {
                        activeCount++;
                    }
                } catch {}
            }

            const resMsg = `╭━━━〔 🧹 *SESSION CLEANER* 〕━━━╮\n` +
                           `┃ 🗑️ *Purged Inactive (>2 Days):* ${purgedCount} files\n` +
                           `┃ 🔒 *Active Maintained:* ${activeCount} files\n` +
                           `┃ 🤖 *Status:* Healthy & Optimized\n` +
                           `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                           `✨ *Automatic 48-hour background garbage collector is active.*`;

            await client.sendMessage(m.chat, { text: resMsg }, { quoted: m });
            await client.sendMessage(m.chat, { react: { text: "🧹", key: m.key } });

        } catch (error) {
            console.error('[ClearSessions Plugin Error]:', error);
            reply(`❌ *Session cleanup failed:* ${error.message}`);
        }
    }
};
