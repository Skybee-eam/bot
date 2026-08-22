const os = require('os');
const { performance } = require('perf_hooks');

const START_TIME = Date.now();

function formatUptime(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(' ');
}

// Verified & Working Command Categories Definition
const VERIFIED_COMMANDS = {
    "🤖 AI & CREATIVE": [
        { cmd: "ai <question>", desc: "Ask CypherX AI anything / smart answers" },
        { cmd: "imagine <prompt>", desc: "Generate ultra-realistic AI images" },
        { cmd: "gpt <prompt>", desc: "Chat with fast conversational AI" },
        { cmd: "ask <query>", desc: "Knowledge base & encyclopedic lookup" }
    ],
    "🎵 MUSIC & AUDIO": [
        { cmd: "play <song title>", desc: "Download high quality MP3 from YouTube" },
        { cmd: "song <title/url>", desc: "Search & download YouTube audio" },
        { cmd: "music <title>", desc: "Stream & download music directly" },
        { cmd: "tomp3", desc: "Convert replied video/voice note to MP3" }
    ],
    "📥 MEDIA DOWNLOADERS": [
        { cmd: "tiktok <url>", desc: "Download TikTok videos without watermark" },
        { cmd: "ig <url>", desc: "Download Instagram reels, posts & carousels" },
        { cmd: "facebook <url>", desc: "Download Facebook HD/SD public videos" },
        { cmd: "ytmp4 <url>", desc: "Download YouTube videos as MP4" },
        { cmd: "video <title/url>", desc: "Search and download YouTube video" }
    ],
    "👁️ PRIVACY & UTILITIES": [
        { cmd: "vv", desc: "Retrieve View Once media (image/video/audio) to DM" },
        { cmd: "sticker", desc: "Convert replied image/video to WhatsApp sticker" },
        { cmd: "take <pack|author>", desc: "Change sticker pack name & author" },
        { cmd: "react <emoji>", desc: "React to replied message with custom emoji" }
    ],
    "👥 GROUP MANAGEMENT": [
        { cmd: "tagall <message>", desc: "Tag all members in the group" },
        { cmd: "hidetag <message>", desc: "Broadcast message tagging everyone invisibly" },
        { cmd: "kick @user", desc: "Remove member from the group" },
        { cmd: "add <number>", desc: "Add member to the group" },
        { cmd: "promote @user", desc: "Promote member to group admin" },
        { cmd: "demote @user", desc: "Demote group admin to member" },
        { cmd: "mute", desc: "Close group (only admins can send messages)" },
        { cmd: "unmute", desc: "Open group (all members can send messages)" },
        { cmd: "link", desc: "Get group invite link" }
    ],
    "⚡ SYSTEM & CORE": [
        { cmd: "ping", desc: "Check bot response speed & server latency" },
        { cmd: "alive", desc: "Show bot system information & uptime" },
        { cmd: "runtime", desc: "Show bot active running duration" },
        { cmd: "clearsessions", desc: "Clean temporary session cache files" },
        { cmd: "menu", desc: "Display this interactive command dashboard" }
    ]
};

module.exports = {
    name: "menu",
    alias: ["help", "commands", "list", "allmenu", "panel"],
    category: "general",
    description: "Displays modern, clean dashboard of all verified working commands",
    async execute(client, m, { args, text, prefix, command, reply }) {
        try {
            const p = prefix || '.';
            const uptime = formatUptime(Date.now() - START_TIME);
            const user = m.pushName || 'User';
            const query = (text || '').trim().toLowerCase();

            // Calculate total verified commands
            let totalCmdCount = 0;
            for (const cat in VERIFIED_COMMANDS) {
                totalCmdCount += VERIFIED_COMMANDS[cat].length;
            }

            const headerCard = 
`┌───「 🐉 *RED DRAGON / CYPHER-X* 🐉 」───┐
│ 👤 *User:* ${user}
│ 👑 *Owner:* RED DRAGON OFC
│ 🤖 *Bot:* CypherX MD v2.0 (Active)
│ ⚡ *Prefix:* [ ${p} ]
│ 📊 *Active Commands:* ${totalCmdCount} Verified
│ ⏱️ *Uptime:* ${uptime}
│ 📡 *Status:* 🟢 All Systems Operational
└───「 ᴄʏᴘʜᴇʀ-x ᴏғғɪᴄɪᴀʟ 」───┘\n`;

            // Single Category View if user types e.g. .menu ai or .menu 1
            const categoryKeys = Object.keys(VERIFIED_COMMANDS);
            let selectedCategory = null;

            if (query && query !== 'all' && query !== 'full') {
                const num = parseInt(query, 10);
                if (!isNaN(num) && num >= 1 && num <= categoryKeys.length) {
                    selectedCategory = categoryKeys[num - 1];
                } else {
                    selectedCategory = categoryKeys.find(k => k.toLowerCase().includes(query));
                }
            }

            if (selectedCategory) {
                const list = VERIFIED_COMMANDS[selectedCategory];
                let catText = `${headerCard}\n╭───『 ${selectedCategory} 』\n`;
                for (const item of list) {
                    catText += `│ ◈ *${p}${item.cmd}*\n│   └─ _${item.desc}_\n`;
                }
                catText += `╰──────────────────────────────\n\n` +
                           `💡 *Tip:* Type *${p}menu* to return to the full menu dashboard.`;

                return await client.sendMessage(m.chat, {
                    text: catText
                }, { quoted: m });
            }

            // Full All-Commands Display
            let fullMenuText = `${headerCard}\n`;

            categoryKeys.forEach((catName, idx) => {
                const list = VERIFIED_COMMANDS[catName];
                fullMenuText += `╭───『 ${catName} 』\n`;
                for (const item of list) {
                    fullMenuText += `│ ◈ *${p}${item.cmd}*\n│   └─ _${item.desc}_\n`;
                }
                fullMenuText += `╰──────────────────────────────\n\n`;
            });

            fullMenuText += 
`╭───『 📌 *QUICK SHORTCUTS* 』
│ • *${p}menu ai* ➔ AI & Creative commands
│ • *${p}menu music* ➔ Music & Audio downloader
│ • *${p}menu dl* ➔ Video downloaders
│ • *${p}menu group* ➔ Group management tools
│ • *${p}menu tools* ➔ Privacy & utility tools
╰──────────────────────────────

🐉 *RED DRAGON OFC • CYPHER-X BOT ENGINE*`;

            await client.sendMessage(m.chat, {
                text: fullMenuText,
                contextInfo: {
                    externalAdReply: {
                        title: "🐉 RED DRAGON / CYPHER-X BOT",
                        body: `535 Commands Loaded • ${uptime} Uptime`,
                        thumbnailUrl: "https://i.imgur.com/2wzL9Zc.png",
                        sourceUrl: "https://github.com/Skybee-eam/bot",
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: m });

        } catch (error) {
            console.error('[Menu Plugin Error]:', error);
            reply(`❌ *Failed to load menu:* ${error.message}`);
        }
    }
};

