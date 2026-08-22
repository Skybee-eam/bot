const { jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    name: "group",
    alias: ["hidetag", "ht", "kick", "remove", "promote", "admin", "demote", "unadmin", "mute", "close", "unmute", "open"],
    category: "group",
    description: "Group administration commands (hidetag, kick, promote, demote, mute, unmute)",
    async execute(client, m, { args, text, prefix, command, isGroup, isAdmin, isBotAdmin, participants, groupMetadata, reply }) {
        try {
            if (!isGroup) {
                return reply("❌ *This command can only be used inside group chats.*");
            }

            if (!isAdmin && !m.isOwner) {
                return reply("⚠️ *You must be a Group Admin to use this command.*");
            }

            // 1. Hidetag / Broadcast to all members
            if (command === 'hidetag' || command === 'ht') {
                const messageText = text || (m.quoted ? m.quoted.text : "📢 *Announcement from Group Admin*");
                const allJids = (participants || []).map(p => p.id);

                await client.sendMessage(m.chat, {
                    text: messageText,
                    mentions: allJids
                }, { quoted: m });
                return;
            }

            // Commands below require the bot to be an Admin
            if (!isBotAdmin) {
                return reply("⚠️ *Please make the bot an Admin to execute group moderation actions.*");
            }

            // 2. Mute group (close group chat to admins only)
            if (command === 'mute' || command === 'close') {
                await client.groupSettingUpdate(m.chat, 'announcement');
                return reply("🔒 *Group chat closed. Only Admins can send messages now.*");
            }

            // 3. Unmute group (open group chat for all members)
            if (command === 'unmute' || command === 'open') {
                await client.groupSettingUpdate(m.chat, 'not_announcement');
                return reply("🔓 *Group chat opened. All members can send messages now.*");
            }

            // Target user extraction (from mention, reply, or number)
            let targetJid = null;
            if (m.quoted && m.quoted.sender) {
                targetJid = m.quoted.sender;
            } else if (text && text.includes('@')) {
                const number = text.replace(/[^0-9]/g, '');
                if (number) targetJid = `${number}@s.whatsapp.net`;
            } else if (args[0] && args[0].replace(/[^0-9]/g, '')) {
                targetJid = `${args[0].replace(/[^0-9]/g, '')}@s.whatsapp.net`;
            }

            if (!targetJid) {
                return reply(`⚠️ *Please mention a user or reply to their message, e.g.:*\n${prefix}${command} @user`);
            }

            targetJid = jidNormalizedUser(targetJid);
            const botJid = jidNormalizedUser(client.user.id);

            if (targetJid === botJid) {
                return reply("❌ *I cannot execute moderation actions on myself.*");
            }

            // 4. Kick / Remove member
            if (command === 'kick' || command === 'remove') {
                await client.groupParticipantsUpdate(m.chat, [targetJid], 'remove');
                return reply(`👢 *Removed @${targetJid.split('@')[0]} from the group.*`, { mentions: [targetJid] });
            }

            // 5. Promote to Admin
            if (command === 'promote' || command === 'admin') {
                await client.groupParticipantsUpdate(m.chat, [targetJid], 'promote');
                return reply(`👑 *Promoted @${targetJid.split('@')[0]} to Group Admin.*`, { mentions: [targetJid] });
            }

            // 6. Demote from Admin
            if (command === 'demote' || command === 'unadmin') {
                await client.groupParticipantsUpdate(m.chat, [targetJid], 'demote');
                return reply(`🔻 *Demoted @${targetJid.split('@')[0]} to regular member.*`, { mentions: [targetJid] });
            }

        } catch (error) {
            console.error('[Group Plugin Error]:', error);
            reply(`❌ *Group action failed:* ${error.message}`);
        }
    }
};
