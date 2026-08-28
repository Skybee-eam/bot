module.exports = {
    name: "autostatus",
    alias: ["autoreadstatus", "autoviewstatus", "statusview", "statusreact", "setstatusemoji"],
    category: "owner",
    description: "Automatically view and react to contact WhatsApp status updates",
    async execute(client, m, { args, text, prefix, command, isOwner, reply, db, saveDatabase }) {
        try {
            if (!isOwner && !m.isOwner) {
                return reply("⚠️ *This setting can only be changed by the bot owner.*");
            }

            const database = global.db || db || { settings: {} };
            if (!database.settings) database.settings = {};

            const cmd = (command || '').toLowerCase();
            const option = (args[0] || '').toLowerCase().trim();

            // 1. Status Emoji customizer
            if (cmd === 'setstatusemoji' || option === 'emoji') {
                const emoji = args[1] || args[0];
                if (!emoji || emoji === 'emoji') {
                    return reply(`💡 *Usage:* ${prefix}setstatusemoji <emoji>\n*Example:* ${prefix}setstatusemoji 💚`);
                }
                database.settings.status_emoji = emoji;
                if (typeof saveDatabase === 'function') await saveDatabase();
                return reply(`✅ *Auto Status reaction emoji updated to:* ${emoji}`);
            }

            // 2. Status React toggle
            if (cmd === 'statusreact') {
                if (option === 'on' || option === '1' || option === 'enable') {
                    database.settings.statusreact = true;
                    if (typeof saveDatabase === 'function') await saveDatabase();
                    return reply(`💚 *Auto Status React Activated!*\nThe bot will automatically react with ${database.settings.status_emoji || '💚'} to statuses.`);
                } else if (option === 'off' || option === '0' || option === 'disable') {
                    database.settings.statusreact = false;
                    if (typeof saveDatabase === 'function') await saveDatabase();
                    return reply(`❌ *Auto Status React Deactivated.*`);
                }
            }

            // 3. Auto Status View toggle
            if (option === 'on' || option === 'enable' || option === '1' || option === 'active') {
                database.settings.autostatus = true;
                if (typeof saveDatabase === 'function') await saveDatabase();

                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ 👁️ *Auto View Status Activated!*\n` +
                    `│ 📡 The bot will instantly view\n` +
                    `│ all contact status updates 24/7.\n` +
                    `│ 💚 Status React: ${database.settings.statusreact ? '🟢 ON' : '🔴 OFF'}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯\n` +
                    `⚡ *Type ${prefix}autostatus off to disable.*`
                );
            } else if (option === 'off' || option === 'disable' || option === '0' || option === 'inactive') {
                database.settings.autostatus = false;
                if (typeof saveDatabase === 'function') await saveDatabase();

                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ ❌ *Auto View Status Deactivated!*\n` +
                    `│ Status updates will no longer be\n` +
                    `│ automatically viewed.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯\n` +
                    `⚡ *Type ${prefix}autostatus on to re-enable.*`
                );
            } else if (option === 'status' || option === 'check') {
                const isAutoStatus = database.settings.autostatus !== false;
                const isAutoReact = !!database.settings.statusreact;
                const emoji = database.settings.status_emoji || '💚';

                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ 📊 *Auto Status Telemetry:*\n` +
                    `│ 👁️ Auto View: ${isAutoStatus ? '🟢 Active (ON)' : '🔴 Inactive (OFF)'}\n` +
                    `│ 💚 Auto React: ${isAutoReact ? `🟢 Active (${emoji})` : '🔴 Inactive (OFF)'}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯`
                );
            } else {
                const isAutoStatus = database.settings.autostatus !== false ? '🟢 ON' : '🔴 OFF';
                const isAutoReact = database.settings.statusreact ? '🟢 ON' : '🔴 OFF';

                return reply(
                    `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                    `│ 👁️ *AUTO VIEW STATUS CONTROL*\n` +
                    `│ 📡 Status Auto-View: ${isAutoStatus}\n` +
                    `│ 💚 Status Auto-React: ${isAutoReact}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                    `📌 *Available Commands:*\n` +
                    `• *${prefix}autostatus on* - Enable auto view status\n` +
                    `• *${prefix}autostatus off* - Disable auto view status\n` +
                    `• *${prefix}autostatus status* - Check current status\n` +
                    `• *${prefix}statusreact on/off* - Toggle emoji reactions\n` +
                    `• *${prefix}setstatusemoji <emoji>* - Change react emoji`
                );
            }
        } catch (err) {
            console.error('[PLUGIN AUTOSTATUS ERROR]:', err);
            reply(`❌ *Error configuring auto status:* ${err.message}`);
        }
    }
};
