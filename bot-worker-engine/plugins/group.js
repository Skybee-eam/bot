const { jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    name: "group",
    alias: [
        "g", "gc", "groupinfo", "hidetag", "ht", "tagall", "everyone", 
        "kick", "remove", "promote", "admin", "demote", "unadmin", 
        "mute", "close", "unmute", "open", "link", "linkgc", "gclink", "grouplink", 
        "revoke", "resetlink", "setname", "setdesc", "welcome", "antilink"
    ],
    category: "group",
    description: "Full-featured Group Administration & Moderation Suite",
    async execute(client, m, { args, text, prefix, command, isGroup, isAdmin, isBotAdmin, participants, groupMetadata, reply, isOwner, db, saveDatabase }) {
        try {
            if (!isGroup) {
                return reply("❌ *This command can only be used inside WhatsApp group chats.*");
            }

            // Fetch live metadata if missing
            if (!groupMetadata || !participants || participants.length === 0) {
                try {
                    groupMetadata = await client.groupMetadata(m.chat);
                    participants = groupMetadata.participants || [];
                } catch (e) {
                    console.warn('[Group Metadata Refresh]:', e.message);
                }
            }

            const cleanCmd = (command || '').toLowerCase();
            const subCmd = (args[0] || '').toLowerCase();

            // ─────────────────────────────────────────────
            // 1. HELP / MENU / GROUP DASHBOARD (.group with no subcommand)
            // ─────────────────────────────────────────────
            if (cleanCmd === 'group' || cleanCmd === 'gc' || cleanCmd === 'groupinfo') {
                if (!subCmd || subCmd === 'info' || subCmd === 'status' || subCmd === 'dashboard') {
                    const groupName = groupMetadata ? groupMetadata.subject : 'WhatsApp Group';
                    const groupOwner = groupMetadata && groupMetadata.owner ? `+${groupMetadata.owner.split('@')[0]}` : 'Unknown';
                    const totalMembers = (participants || []).length;
                    const adminCount = (participants || []).filter(p => p.admin).length;
                    const isClosed = groupMetadata && groupMetadata.announce ? '🔒 Admins Only' : '🔓 All Members';
                    const chatId = m.chat;

                    const menu = `┌───「 👥 *GROUP ADMINISTRATION* 」───┐\n` +
                                 `│ 📌 *Group:* ${groupName}\n` +
                                 `│ 👑 *Owner:* ${groupOwner}\n` +
                                 `│ 👥 *Members:* ${totalMembers} (${adminCount} Admins)\n` +
                                 `│ 💬 *Chat Status:* ${isClosed}\n` +
                                 `│ 🤖 *Bot Admin:* ${isBotAdmin ? '✅ Yes' : '❌ No (make bot admin)'}\n` +
                                 `│ 🛡️ *Your Role:* ${isAdmin ? '👑 Admin' : '👤 Member'}\n` +
                                 `└───「 ʙʏ sᴋʏʙᴇᴇ ʙᴏᴛ 」───┘\n\n` +
                                 `╭───『 🛠️ *AVAILABLE COMMANDS* 』\n` +
                                 `│ ◈ *${prefix}group open* / *${prefix}open* - Allow all members to send messages\n` +
                                 `│ ◈ *${prefix}group close* / *${prefix}close* - Only admins can send messages\n` +
                                 `│ ◈ *${prefix}hidetag <text>* - Tag all members invisibly\n` +
                                 `│ ◈ *${prefix}tagall <text>* - Mention every member in chat\n` +
                                 `│ ◈ *${prefix}kick @user* - Remove member from group\n` +
                                 `│ ◈ *${prefix}promote @user* - Promote member to Admin\n` +
                                 `│ ◈ *${prefix}demote @user* - Demote admin to member\n` +
                                 `│ ◈ *${prefix}link* - Get group invite link\n` +
                                 `│ ◈ *${prefix}revoke* - Reset group invite link\n` +
                                 `│ ◈ *${prefix}setname <name>* - Change group subject\n` +
                                 `│ ◈ *${prefix}setdesc <desc>* - Change group description\n` +
                                 `│ ◈ *${prefix}welcome on/off* - Enable/disable welcome msg\n` +
                                 `│ ◈ *${prefix}antilink on/off* - Auto-delete links\n` +
                                 `╰──────────────────────────────\n\n` +
                                 `💡 *Example:* *${prefix}group open* or *${prefix}hidetag Hello team!*`;
                    return reply(menu);
                }
            }

            // ─────────────────────────────────────────────
            // 2. PERMISSION VERIFICATION
            // ─────────────────────────────────────────────
            if (!isAdmin && !isOwner) {
                return reply("⚠️ *Access Denied:* You must be a Group Admin to use this command.");
            }

            // ─────────────────────────────────────────────
            // 3. HIDETAG & TAGALL
            // ─────────────────────────────────────────────
            if (cleanCmd === 'hidetag' || cleanCmd === 'ht' || (cleanCmd === 'group' && (subCmd === 'hidetag' || subCmd === 'ht'))) {
                let tagMessage = '';
                if (cleanCmd === 'group') {
                    tagMessage = args.slice(1).join(' ');
                } else {
                    tagMessage = text;
                }
                if (!tagMessage && m.quoted && m.quoted.text) {
                    tagMessage = m.quoted.text;
                }
                if (!tagMessage) {
                    tagMessage = '📢 *Announcement from Group Admin*';
                }

                const allJids = (participants || []).map(p => p.id);
                await client.sendMessage(m.chat, {
                    text: tagMessage,
                    mentions: allJids
                }, { quoted: m });
                return;
            }

            if (cleanCmd === 'tagall' || cleanCmd === 'everyone' || (cleanCmd === 'group' && (subCmd === 'tagall' || subCmd === 'everyone'))) {
                let tagMessage = '';
                if (cleanCmd === 'group') {
                    tagMessage = args.slice(1).join(' ');
                } else {
                    tagMessage = text;
                }
                const allParticipants = participants || [];
                let response = `📢 *ATTENTION EVERYONE* 📢\n`;
                if (tagMessage) {
                    response += `💬 *Message:* ${tagMessage}\n\n`;
                } else {
                    response += `\n`;
                }

                allParticipants.forEach((mem, i) => {
                    response += `${i + 1}. @${mem.id.split('@')[0]}\n`;
                });

                response += `\n> 🐝 *SKYBEE BOT • AUTOMATION*`;

                await client.sendMessage(m.chat, {
                    text: response,
                    mentions: allParticipants.map(a => a.id)
                }, { quoted: m });
                return;
            }

            // ─────────────────────────────────────────────
            // 4. MUTE / CLOSE GROUP
            // ─────────────────────────────────────────────
            if (cleanCmd === 'mute' || cleanCmd === 'close' || (cleanCmd === 'group' && (subCmd === 'mute' || subCmd === 'close'))) {
                if (!isBotAdmin) return reply("⚠️ *Bot needs Admin privileges to change group settings.*");
                await client.groupSettingUpdate(m.chat, 'announcement');
                return reply("🔒 *Group chat closed. Only Admins can send messages now.*");
            }

            // ─────────────────────────────────────────────
            // 5. UNMUTE / OPEN GROUP
            // ─────────────────────────────────────────────
            if (cleanCmd === 'unmute' || cleanCmd === 'open' || (cleanCmd === 'group' && (subCmd === 'unmute' || subCmd === 'open'))) {
                if (!isBotAdmin) return reply("⚠️ *Bot needs Admin privileges to change group settings.*");
                await client.groupSettingUpdate(m.chat, 'not_announcement');
                return reply("🔓 *Group chat opened. All members can send messages now.*");
            }

            // ─────────────────────────────────────────────
            // 6. GROUP LINK & REVOKE LINK
            // ─────────────────────────────────────────────
            if (cleanCmd === 'link' || cleanCmd === 'linkgc' || cleanCmd === 'gclink' || cleanCmd === 'grouplink' || (cleanCmd === 'group' && subCmd === 'link')) {
                if (!isBotAdmin) return reply("⚠️ *Bot needs Admin privileges to fetch group invite link.*");
                const code = await client.groupInviteCode(m.chat);
                const link = `https://chat.whatsapp.com/${code}`;
                const subject = groupMetadata ? groupMetadata.subject : 'This Group';
                return reply(`🔗 *Invite Link for ${subject}:*\n\n${link}\n\n> 🐝 *Skybee Group Manager*`);
            }

            if (cleanCmd === 'revoke' || cleanCmd === 'resetlink' || (cleanCmd === 'group' && (subCmd === 'revoke' || subCmd === 'resetlink'))) {
                if (!isBotAdmin) return reply("⚠️ *Bot needs Admin privileges to revoke invite link.*");
                await client.groupRevokeInvite(m.chat);
                const newCode = await client.groupInviteCode(m.chat);
                return reply(`🔄 *Group invite link has been reset!*\n\n*New Link:* https://chat.whatsapp.com/${newCode}`);
            }

            // ─────────────────────────────────────────────
            // 7. SET NAME & SET DESCRIPTION
            // ─────────────────────────────────────────────
            if (cleanCmd === 'setname' || (cleanCmd === 'group' && subCmd === 'setname')) {
                if (!isBotAdmin) return reply("⚠️ *Bot needs Admin privileges to update group name.*");
                const newName = cleanCmd === 'group' ? args.slice(1).join(' ') : text;
                if (!newName) return reply(`⚠️ *Please specify a new group name:*\n${prefix}setname <New Name>`);
                await client.groupUpdateSubject(m.chat, newName);
                return reply(`✅ *Group subject updated to:* *${newName}*`);
            }

            if (cleanCmd === 'setdesc' || (cleanCmd === 'group' && subCmd === 'setdesc')) {
                if (!isBotAdmin) return reply("⚠️ *Bot needs Admin privileges to update group description.*");
                const newDesc = cleanCmd === 'group' ? args.slice(1).join(' ') : text;
                if (!newDesc) return reply(`⚠️ *Please specify a new group description:*\n${prefix}setdesc <New Description>`);
                await client.groupUpdateDescription(m.chat, newDesc);
                return reply(`✅ *Group description has been successfully updated!*`);
            }

            // ─────────────────────────────────────────────
            // 8. WELCOME & ANTILINK TOGGLES
            // ─────────────────────────────────────────────
            if (cleanCmd === 'welcome' || (cleanCmd === 'group' && subCmd === 'welcome')) {
                const opt = (cleanCmd === 'group' ? args[1] : args[0]) || '';
                const state = opt.toLowerCase();
                if (state !== 'on' && state !== 'off') {
                    return reply(`⚠️ *Usage:* *${prefix}welcome on* or *${prefix}welcome off*`);
                }
                if (db && db.chats) {
                    if (!db.chats[m.chat]) db.chats[m.chat] = {};
                    db.chats[m.chat].welcome = (state === 'on');
                    if (saveDatabase) await saveDatabase();
                }
                return reply(`👋 *Welcome greetings are now ${state === 'on' ? '🟢 ENABLED' : '🔴 DISABLED'} for this group.*`);
            }

            if (cleanCmd === 'antilink' || (cleanCmd === 'group' && subCmd === 'antilink')) {
                const opt = (cleanCmd === 'group' ? args[1] : args[0]) || '';
                const state = opt.toLowerCase();
                if (state !== 'on' && state !== 'off' && state !== 'delete' && state !== 'kick') {
                    return reply(`⚠️ *Usage:* *${prefix}antilink on* (delete) or *${prefix}antilink off*`);
                }
                if (db && db.chats) {
                    if (!db.chats[m.chat]) db.chats[m.chat] = {};
                    db.chats[m.chat].antilink = (state === 'on' || state === 'delete');
                    db.chats[m.chat].antilinkkick = (state === 'kick');
                    if (saveDatabase) await saveDatabase();
                }
                return reply(`🛡️ *Anti-Link protection is now ${state === 'off' ? '🔴 DISABLED' : '🟢 ENABLED'} for this group.*`);
            }

            // ─────────────────────────────────────────────
            // 9. MODERATION ACTIONS (KICK, PROMOTE, DEMOTE)
            // ─────────────────────────────────────────────
            const isKick = cleanCmd === 'kick' || cleanCmd === 'remove' || (cleanCmd === 'group' && (subCmd === 'kick' || subCmd === 'remove'));
            const isPromote = cleanCmd === 'promote' || cleanCmd === 'admin' || (cleanCmd === 'group' && (subCmd === 'promote' || subCmd === 'admin'));
            const isDemote = cleanCmd === 'demote' || cleanCmd === 'unadmin' || (cleanCmd === 'group' && (subCmd === 'demote' || subCmd === 'unadmin'));

            if (isKick || isPromote || isDemote) {
                if (!isBotAdmin) {
                    return reply("⚠️ *Please make the bot an Admin to execute group moderation actions.*");
                }

                // Extract target user
                let targetJid = null;
                if (m.mentionedJid && m.mentionedJid.length > 0) {
                    targetJid = m.mentionedJid[0];
                } else if (m.quoted && m.quoted.sender) {
                    targetJid = m.quoted.sender;
                } else {
                    const remainingArgs = cleanCmd === 'group' ? args.slice(1) : args;
                    const combined = remainingArgs.join(' ').replace(/[^0-9]/g, '');
                    if (combined && combined.length >= 7) {
                        targetJid = `${combined}@s.whatsapp.net`;
                    }
                }

                if (!targetJid) {
                    const actionName = isKick ? 'kick' : isPromote ? 'promote' : 'demote';
                    return reply(`⚠️ *Please mention a user or reply to their message, e.g.:*\n*${prefix}${actionName} @user*`);
                }

                targetJid = jidNormalizedUser(targetJid);
                const botJid = jidNormalizedUser(client.user.id);
                const targetClean = targetJid.split('@')[0];

                if (targetJid === botJid || targetClean === botJid.split('@')[0]) {
                    return reply("❌ *I cannot execute moderation actions on myself.*");
                }

                if (isKick) {
                    await client.groupParticipantsUpdate(m.chat, [targetJid], 'remove');
                    return reply(`👢 *Successfully removed @${targetClean} from the group.*`, { mentions: [targetJid] });
                }

                if (isPromote) {
                    await client.groupParticipantsUpdate(m.chat, [targetJid], 'promote');
                    return reply(`👑 *Successfully promoted @${targetClean} to Group Admin!*`, { mentions: [targetJid] });
                }

                if (isDemote) {
                    await client.groupParticipantsUpdate(m.chat, [targetJid], 'demote');
                    return reply(`🔻 *Successfully demoted @${targetClean} to regular member.*`, { mentions: [targetJid] });
                }
            }

            // Fallback
            return reply(`❓ *Unknown group action.* Type *${prefix}group* to see all available commands.`);

        } catch (error) {
            console.error('[Group Plugin Error]:', error);
            reply(`❌ *Group action failed:* ${error.message}`);
        }
    }
};
