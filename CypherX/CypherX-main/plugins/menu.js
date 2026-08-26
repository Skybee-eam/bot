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

function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return '🌅 Good Morning';
    if (hour >= 12 && hour < 17) return '☀️ Good Afternoon';
    if (hour >= 17 && hour < 21) return '🌆 Good Evening';
    return '🌙 Good Night';
}

function getMemoryUsage() {
    const total = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(1);
    const free = (os.freemem() / (1024 * 1024 * 1024)).toFixed(1);
    const used = (total - free).toFixed(1);
    return `${used}GB / ${total}GB`;
}

// Verified & Working Command Categories
const VERIFIED_COMMANDS = {
    "🤖 ARTIFICIAL INTELLIGENCE & CHATBOT": {
        icon: "🧠",
        commands: [
            { cmd: "ai <question>", desc: "Ask Skybee AI smart questions" },
            { cmd: "chatbot on/off", desc: "Toggle automatic AI responses in DM" },
            { cmd: "imagine <prompt>", desc: "Generate realistic AI art & images" },
            { cmd: "gpt <prompt>", desc: "Conversational GPT assistant" },
            { cmd: "ask <query>", desc: "Instant encyclopedia & facts" }
        ]
    },
    "🎵 MUSIC & AUDIO STUDIO": {
        icon: "🎧",
        commands: [
            { cmd: "play <song title>", desc: "Download high quality MP3 audio" },
            { cmd: "song <title/url>", desc: "Search & download YouTube tracks" },
            { cmd: "music <title>", desc: "Stream & save song directly" },
            { cmd: "tomp3", desc: "Convert replied video/audio to MP3" }
        ]
    },
    "📥 MEDIA & VIDEO DOWNLOADERS": {
        icon: "⚡",
        commands: [
            { cmd: "video <title/url>", desc: "Search & download HD YouTube video" },
            { cmd: "ytmp4 <url>", desc: "Download YouTube videos as MP4" },
            { cmd: "movie <title>", desc: "Search & download movie trailer/clip" },
            { cmd: "movieinfo <title>", desc: "Get full IMDb details, cast & synopsis" },
            { cmd: "tiktok <url>", desc: "Download TikTok videos without watermark" },
            { cmd: "ig <url>", desc: "Download Instagram Reels & posts" },
            { cmd: "facebook <url>", desc: "Download Facebook HD videos" }
        ]
    },
    "👁️ PRIVACY & UTILITIES": {
        icon: "🛠️",
        commands: [
            { cmd: "anticall decline/block/off", desc: "Auto-reject and block incoming WhatsApp calls" },
            { cmd: "antidelete private/chat/off", desc: "Recover deleted messages, photos & audio" },
            { cmd: "antidelete status", desc: "Check current anti-delete mode" },
            { cmd: "autostatus on/off", desc: "Toggle 24/7 automatic status viewing" },
            { cmd: "statusreact on/off", desc: "Toggle automatic emoji reactions on statuses" },
            { cmd: "setstatusemoji <emoji>", desc: "Customize auto reaction emoji (e.g. 💚)" },
            { cmd: "vv", desc: "Retrieve View-Once media permanently to DM" },
            { cmd: "sticker", desc: "Convert image/video into WhatsApp sticker" },
            { cmd: "react <emoji>", desc: "React to message with custom emoji" }
        ]
    },
    "👥 GROUP AUTOMATION & MODERATION": {
        icon: "🛡️",
        commands: [
            { cmd: "welcome on/off", desc: "Toggle auto welcome & farewell cards" },
            { cmd: "welcome status", desc: "Check group greeting card status" },
            { cmd: "tagall <message>", desc: "Tag all group members with a notice" },
            { cmd: "hidetag <message>", desc: "Broadcast message invisibly to all" },
            { cmd: "kick @user", desc: "Remove unwanted user from group" },
            { cmd: "promote @user", desc: "Grant administrator privileges" },
            { cmd: "demote @user", desc: "Revoke administrator privileges" },
            { cmd: "mute", desc: "Lock chat (Admins only)" },
            { cmd: "unmute", desc: "Unlock chat (All members)" },
            { cmd: "link", desc: "Retrieve group invitation link" }
        ]
    },
    "🕊️ RELIGION & SACRED SCRIPTURES": {
        icon: "📖",
        commands: [
            { cmd: "bible <book chapter:verse>", desc: "Look up Holy Bible scriptures (e.g. John 3:16)" },
            { cmd: "dailyverse", desc: "Inspirational Bible verse of the day" },
            { cmd: "quran <surah:ayah>", desc: "Look up Holy Quran with Arabic & English (e.g. 2:255)" },
            { cmd: "surah <number>", desc: "Explore entire Quranic Surahs" },
            { cmd: "quranaudio <surah:ayah>", desc: "Listen to crystal clear Quran MP3 recitation" },
            { cmd: "dailyayah", desc: "Inspirational Quranic Ayah of the day" }
        ]
    },
    "💡 MOTIVATION & INSPIRATION": {
        icon: "✨",
        commands: [
            { cmd: "automindset on/off", desc: "Toggle 24/7 hourly motivation broadcasts" },
            { cmd: "automindset status", desc: "Check hourly mindset telemetry" },
            { cmd: "automindset test", desc: "Test run an instant hourly mindset broadcast" },
            { cmd: "automindset group", desc: "Toggle hourly mindset in current group" },
            { cmd: "motivation", desc: "Instant motivational quotes & success advice" },
            { cmd: "mindset", desc: "Powerful growth and discipline principles" },
            { cmd: "quote", desc: "Inspirational thoughts from iconic leaders" }
        ]
    },
    "⚡ SYSTEM & CORE METRICS": {
        icon: "📊",
        commands: [
            { cmd: "link", desc: "Get official Skybee Bot store activation link" },
            { cmd: "store", desc: "Share bot referral link with friends" },
            { cmd: "ping", desc: "Check server latency & ping response" },
            { cmd: "alive", desc: "Display bot health & system status" },
            { cmd: "clearsessions", desc: "Purge temporary cache files" },
            { cmd: "menu", desc: "Display the main control dashboard" }
        ]
    }
};

module.exports = {
    name: "menu",
    alias: ["help", "commands", "list", "allmenu", "panel", "start"],
    category: "general",
    description: "Displays a modern, aesthetic command directory dashboard",
    async execute(client, m, { args, text, prefix, command, reply }) {
        try {
            const p = prefix || '.';
            const uptime = formatUptime(Date.now() - START_TIME);
            const user = m.pushName || 'User';
            const greeting = getGreeting();
            const memory = getMemoryUsage();
            const query = (text || '').trim().toLowerCase();

            // Total command count
            let totalCmdCount = 0;
            for (const cat in VERIFIED_COMMANDS) {
                totalCmdCount += VERIFIED_COMMANDS[cat].commands.length;
            }

            const categoryKeys = Object.keys(VERIFIED_COMMANDS);

            // Filter single category if specified
            let selectedCategory = null;
            if (query && query !== 'all' && query !== 'full') {
                const num = parseInt(query, 10);
                if (!isNaN(num) && num >= 1 && num <= categoryKeys.length) {
                    selectedCategory = categoryKeys[num - 1];
                } else {
                    selectedCategory = categoryKeys.find(k => k.toLowerCase().includes(query));
                }
            }

            // Header Banner Block
            const headerBlock =
`╭─━─━─━─━─━─━─━─━─━─━─━─━─━─━─╮
  🐝 *SKYBEE BOT* 🐝
  ${greeting}, *${user}*!
╰─━─━─━─━─━─━─━─━─━─━─━─━─━─━─╯

┌───「 📊 *SYSTEM TELEMETRY* 」───┐
│ 👤 *User:* ${user}
│ 👑 *Developer:* SKYBEE BOT
│ 🤖 *Engine:* Skybee Bot MD v2.0
│ ⚡ *Prefix:* [ ${p} ]
│ 🧠 *RAM:* ${memory}
│ ⏱️ *Uptime:* ${uptime}
│ 📡 *Status:* 🟢 Optimal (Active)
│ 📦 *Commands:* ${totalCmdCount} Verified
└───「 sᴋʏʙᴇᴇ ʙᴏᴛ ᴏғғɪᴄɪᴀʟ 」───┘`;

            // If a specific category was requested
            if (selectedCategory) {
                const catObj = VERIFIED_COMMANDS[selectedCategory];
                let singleText = `${headerBlock}\n\n` +
                                 `╭─◈ 『 ${catObj.icon} *${selectedCategory}* 』\n`;

                for (const item of catObj.commands) {
                    singleText += `│  › *${p}${item.cmd}*\n│    └─ _${item.desc}_\n`;
                }

                singleText += `╰──────────────────────────────\n\n` +
                              `💡 *Tip:* Send *${p}menu* to view the entire master dashboard.`;

                return await client.sendMessage(m.chat, {
                    text: singleText
                }, { quoted: m });
            }

            // Full Master Dashboard Display
            let fullText = `${headerBlock}\n\n`;

            categoryKeys.forEach((catName) => {
                const catObj = VERIFIED_COMMANDS[catName];
                fullText += `╭─◈ 『 ${catObj.icon} *${catName}* 』\n`;
                for (const item of catObj.commands) {
                    fullText += `│  › *${p}${item.cmd}*\n│    └─ _${item.desc}_\n`;
                }
                fullText += `╰──────────────────────────────\n\n`;
            });

            fullText += 
`╭─◈ 『 💡 *NAVIGATION SHORTCUTS* 』
│  › *${p}menu ai* ➔ AI & Art Generator
│  › *${p}menu music* ➔ Music & Audio Studio
│  › *${p}menu dl* ➔ Video Downloaders
│  › *${p}menu group* ➔ Group Management
│  › *${p}menu tools* ➔ Privacy & Sticker Tools
╰──────────────────────────────

🐝 *SKYBEE BOT • CONNECTIVITY AND AUTOMATION*`;

            await client.sendMessage(m.chat, {
                text: fullText
            }, m.fromMe ? {} : { quoted: m });

        } catch (error) {
            console.error('[Menu Plugin Error]:', error);
            reply(`❌ *Failed to load menu:* ${error.message}`);
        }
    }
};


