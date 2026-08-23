module.exports = {
    name: "anticall",
    alias: ["autocallreject", "blockcalls", "rejectcalls", "anticallmode"],
    category: "privacy",
    description: "Reject and automatically block incoming audio & video WhatsApp calls",
    async execute(client, m, { args, text, prefix, command, isOwner, reply, db, saveDatabase }) {
        try {
            if (!isOwner && !m.isOwner) {
                return reply("⚠️ *This setting can only be changed by the bot owner.*");
            }

            const database = global.db || db || { settings: {} };
            if (!database.settings) database.settings = {};

            const option = (args[0] || '').toLowerCase().trim();

            if (option === 'decline' || option === 'reject' || option === 'on' || option === '1' || option === 'enable') {
                database.settings.anticall = 'decline';
                if (typeof saveDatabase === 'function') await saveDatabase();

                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ 📵 *Anti-Call Activated!*\n` +
                    `│ 📡 Mode: *Decline / Reject*\n` +
                    `│ ⚠️ All incoming audio & video calls\n` +
                    `│ will be rejected with an auto-warning.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯`
                );
            } else if (option === 'block' || option === 'autoblock') {
                database.settings.anticall = 'block';
                if (typeof saveDatabase === 'function') await saveDatabase();

                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ 🚫 *Anti-Call [BLOCK MODE] Activated!*\n` +
                    `│ 📡 Mode: *Reject & Block*\n` +
                    `│ ⚠️ Anyone calling this bot number\n` +
                    `│ will have their call rejected and\n` +
                    `│ will be immediately blocked.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯`
                );
            } else if (option === 'off' || option === 'disable' || option === '0') {
                database.settings.anticall = false;
                if (typeof saveDatabase === 'function') await saveDatabase();

                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ ❌ *Anti-Call Deactivated!*\n` +
                    `│ Incoming calls will no longer\n` +
                    `│ be rejected or blocked.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯\n` +
                    `⚡ *Type ${prefix}anticall decline to re-enable.*`
                );
            } else if (option === 'status' || option === 'check') {
                const currentMode = database.settings.anticall;
                const isEnabled = currentMode && currentMode !== 'off';

                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ 📊 *Anti-Call Status:*\n` +
                    `│ 📡 State: ${isEnabled ? `🟢 Active (${String(currentMode).toUpperCase()})` : '🔴 Inactive (OFF)'}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯`
                );
            } else {
                const currentMode = database.settings.anticall ? String(database.settings.anticall).toUpperCase() : 'OFF';

                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ 📵 *ANTI-CALL CONFIGURATION*\n` +
                    `│ 📡 Current Mode: *${currentMode}*\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                    `📌 *Available Options:*\n` +
                    `• *${prefix}anticall decline* - Automatically decline calls & send warning (Recommended)\n` +
                    `• *${prefix}anticall block* - Decline and immediately block callers\n` +
                    `• *${prefix}anticall off* - Disable anti-call protection\n` +
                    `• *${prefix}anticall status* - Check active mode`
                );
            }
        } catch (err) {
            console.error('[PLUGIN ANTICALL ERROR]:', err);
            reply(`❌ *Error configuring anti-call:* ${err.message}`);
        }
    }
};
