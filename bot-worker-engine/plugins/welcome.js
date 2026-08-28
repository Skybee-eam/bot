module.exports = {
    name: "welcome",
    alias: ["goodbye", "setwelcome", "welcomemsg", "welcometoggle"],
    category: "group",
    description: "Toggle automated group welcome and goodbye greeting cards",
    async execute(client, m, { args, text, prefix, command, isGroup, isAdmin, isOwner, reply, db, saveDatabase }) {
        try {
            if (!isGroup) {
                return reply("❌ *This command can only be used inside group chats.*");
            }

            if (!isAdmin && !isOwner && !m.isOwner) {
                return reply("⚠️ *Only Group Admins can configure welcome and goodbye messages.*");
            }

            const database = global.db || db || { chats: {} };
            if (!database.chats) database.chats = {};
            if (!database.chats[m.chat]) database.chats[m.chat] = {};

            const option = (args[0] || '').toLowerCase().trim();

            if (option === 'on' || option === 'enable' || option === '1' || option === 'active') {
                database.chats[m.chat].welcome = true;
                if (typeof saveDatabase === 'function') {
                    await saveDatabase();
                }

                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ ✅ *Welcome System Activated!*\n` +
                    `│ 📢 New members joining this group\n` +
                    `│ will receive greeting cards & profile tags.\n` +
                    `│ 🚪 Leaving members will receive farewell cards.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯\n` +
                    `⚡ *Type ${prefix}welcome off to disable anytime.*`
                );
            } else if (option === 'off' || option === 'disable' || option === '0' || option === 'inactive') {
                database.chats[m.chat].welcome = false;
                if (typeof saveDatabase === 'function') {
                    await saveDatabase();
                }

                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ ❌ *Welcome System Deactivated!*\n` +
                    `│ Greeting & farewell messages are now\n` +
                    `│ disabled for this group.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯\n` +
                    `⚡ *Type ${prefix}welcome on to re-enable.*`
                );
            } else if (option === 'status' || option === 'check') {
                const isEnabled = database.chats[m.chat].welcome !== false;
                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ 📊 *Group Welcome Status:*\n` +
                    `│ 📡 State: ${isEnabled ? '🟢 Active (ON)' : '🔴 Inactive (OFF)'}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯`
                );
            } else {
                const currentStatus = database.chats[m.chat].welcome !== false ? '🟢 ON' : '🔴 OFF';
                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ ⚙️ *GROUP WELCOME & GOODBYE*\n` +
                    `│ 📊 Current Status: *${currentStatus}*\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                    `📌 *Usage Commands:*\n` +
                    `• *${prefix}welcome on* — Enable welcome & farewell cards\n` +
                    `• *${prefix}welcome off* — Disable welcome & farewell cards\n` +
                    `• *${prefix}welcome status* — Check current status\n\n` +
                    `🐝 *SKYBEE BOT • CONNECTIVITY AND AUTOMATION*`
                );
            }
        } catch (error) {
            console.error('[Welcome Plugin Error]:', error);
            reply(`❌ *Failed to configure welcome settings:* ${error.message}`);
        }
    }
};
