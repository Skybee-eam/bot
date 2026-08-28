module.exports = {
    name: "restart",
    alias: ["reboot", "reload", "reconnect"],
    category: "owner",
    description: "Safely restarts and reboots the Skybee Bot Engine",
    async execute(client, m, { prefix, command, isOwner, reply }) {
        try {
            // Security check: Only bot owner or linked WhatsApp account can trigger restart
            if (!m.isOwner && !isOwner) {
                return reply("⚠️ *Access Denied:* Only the bot owner can use the .restart command.");
            }

            const botNum = client.user?.id ? client.user.id.split('@')[0].split(':')[0] : 'Bot';
            const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            const restartNotice = 
`╭━━━〔 🔄 *REBOOTING SYSTEM* 〕━━━╮
┃ 🤖 *Instance:* +${botNum}
┃ ⚡ *Status:* Initiating Clean Restart
┃ ⏱️ *Timestamp:* ${timeStr}
┃ 🚀 *Recovery:* Reconnecting in 3-5s...
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

_Please wait a few seconds while the bot reloads all plugins and reconnects..._`;

            await reply(restartNotice);

            // Wait 1.5s to ensure WhatsApp server receives the reply, then exit for supervisor auto-restart
            setTimeout(() => {
                console.log(`[CYPHER-X] Restart command received from +${m.sender.split('@')[0]}. Rebooting process...`);
                process.exit(0);
            }, 1500);

        } catch (error) {
            console.error('[Restart Plugin Error]:', error);
            reply(`❌ *Failed to restart bot:* ${error.message}`);
        }
    }
};
