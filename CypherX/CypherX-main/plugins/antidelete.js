module.exports = {
    name: "antidelete",
    alias: ["antirevoke", "antidel", "antideletechat"],
    category: "privacy",
    description: "Recover and view deleted / revoked WhatsApp messages and media",
    async execute(client, m, { args, text, prefix, command, isOwner, reply, db, saveDatabase }) {
        try {
            if (!isOwner && !m.isOwner) {
                return reply("⚠️ *This setting can only be changed by the bot owner.*");
            }

            const database = global.db || db || { settings: {} };
            if (!database.settings) database.settings = {};

            const option = (args[0] || '').toLowerCase().trim();

            if (option === 'private' || option === 'dm' || option === 'me' || option === 'on') {
                database.settings.antidelete = 'private';
                if (typeof saveDatabase === 'function') await saveDatabase();

                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ 🗑️ *Anti-Delete Activated!*\n` +
                    `│ 📥 Mode: *Private (DM)*\n` +
                    `│ 💬 All deleted messages, images,\n` +
                    `│ audio & stickers will be recovered\n` +
                    `│ and sent directly to your private chat.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯`
                );
            } else if (option === 'chat' || option === 'group' || option === 'here') {
                database.settings.antidelete = 'chat';
                if (typeof saveDatabase === 'function') await saveDatabase();

                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ 🗑️ *Anti-Delete Activated!*\n` +
                    `│ 💬 Mode: *Current Chat*\n` +
                    `│ 📢 Deleted messages will be\n` +
                    `│ recovered and resent into the chat\n` +
                    `│ where they were deleted.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯`
                );
            } else if (option === 'off' || option === 'disable' || option === '0') {
                database.settings.antidelete = 'off';
                if (typeof saveDatabase === 'function') await saveDatabase();

                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ ❌ *Anti-Delete Deactivated!*\n` +
                    `│ Deleted messages will no longer\n` +
                    `│ be monitored or recovered.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯\n` +
                    `⚡ *Type ${prefix}antidelete private to re-enable.*`
                );
            } else if (option === 'status' || option === 'check') {
                const currentMode = database.settings.antidelete || 'private';
                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ 📊 *Anti-Delete Status:*\n` +
                    `│ 📡 State: ${currentMode !== 'off' ? `🟢 Active (${currentMode.toUpperCase()})` : '🔴 Inactive (OFF)'}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯`
                );
            } else {
                const currentMode = (database.settings.antidelete || 'private').toUpperCase();
                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ 🗑️ *ANTI-DELETE CONFIGURATION*\n` +
                    `│ 📡 Current Mode: *${currentMode}*\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                    `📌 *Available Options:*\n` +
                    `• *${prefix}antidelete private* - Send deleted messages to your DM (Recommended)\n` +
                    `• *${prefix}antidelete chat* - Resend deleted messages in the active chat\n` +
                    `• *${prefix}antidelete off* - Disable anti-delete\n` +
                    `• *${prefix}antidelete status* - Check active status`
                );
            }
        } catch (err) {
            console.error('[PLUGIN ANTIDELETE ERROR]:', err);
            reply(`❌ *Error configuring anti-delete:* ${err.message}`);
        }
    }
};
