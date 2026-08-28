const axios = require('axios');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

const CURATED_QUOTES = [
    {
        quote: "The future belongs to those who believe in the beauty of their dreams.",
        author: "Eleanor Roosevelt",
        category: "Vision & Dreams"
    },
    {
        quote: "It does not matter how slowly you go as long as you do not stop.",
        author: "Confucius",
        category: "Persistence"
    },
    {
        quote: "Success is not final, failure is not fatal: it is the courage to continue that counts.",
        author: "Winston Churchill",
        category: "Resilience"
    },
    {
        quote: "Your time is limited, so don't waste it living someone else's life.",
        author: "Steve Jobs",
        category: "Authenticity & Purpose"
    },
    {
        quote: "Believe you can and you're halfway there.",
        author: "Theodore Roosevelt",
        category: "Self-Belief"
    },
    {
        quote: "The only limit to our realization of tomorrow will be our doubts of today.",
        author: "Franklin D. Roosevelt",
        category: "Mindset"
    },
    {
        quote: "Hardships often prepare ordinary people for an extraordinary destiny.",
        author: "C.S. Lewis",
        category: "Growth"
    },
    {
        quote: "Do what you can, with what you have, where you are.",
        author: "Theodore Roosevelt",
        category: "Action"
    },
    {
        quote: "Don't watch the clock; do what it does. Keep going.",
        author: "Sam Levenson",
        category: "Focus & Discipline"
    },
    {
        quote: "The secret of getting ahead is getting started.",
        author: "Mark Twain",
        category: "Execution"
    },
    {
        quote: "You miss 100% of the shots you don't take.",
        author: "Wayne Gretzky",
        category: "Courage"
    },
    {
        quote: "Discipline is the bridge between goals and accomplishment.",
        author: "Jim Rohn",
        category: "Discipline"
    },
    {
        quote: "I never dreamed about success. I worked for it.",
        author: "Estée Lauder",
        category: "Hard Work"
    },
    {
        quote: "Opportunities don't happen. You create them.",
        author: "Chris Grosser",
        category: "Opportunity"
    },
    {
        quote: "What lies behind us and what lies before us are tiny matters compared to what lies within us.",
        author: "Ralph Waldo Emerson",
        category: "Inner Strength"
    },
    {
        quote: "Champions keep playing until they get it right.",
        author: "Billie Jean King",
        category: "Mastery"
    },
    {
        quote: "Action is the foundational key to all success.",
        author: "Pablo Picasso",
        category: "Momentum"
    },
    {
        quote: "Don't let yesterday take up too much of today.",
        author: "Will Rogers",
        category: "Presence"
    },
    {
        quote: "If you want to achieve greatness stop asking for permission.",
        author: "Anonymous",
        category: "Boldness"
    },
    {
        quote: "Stay hungry, stay foolish.",
        author: "Steve Jobs",
        category: "Curiosity"
    }
];

async function getQuote() {
    let quoteText = '';
    let quoteAuthor = '';
    let quoteCategory = 'Daily Mindset';

    try {
        const res = await axios.get('https://zenquotes.io/api/random', { timeout: 3500 });
        if (res.data && res.data[0] && res.data[0].q) {
            quoteText = res.data[0].q.trim();
            quoteAuthor = res.data[0].a.trim() || 'Unknown';
        }
    } catch {}

    if (!quoteText) {
        const randomItem = CURATED_QUOTES[Math.floor(Math.random() * CURATED_QUOTES.length)];
        quoteText = randomItem.quote;
        quoteAuthor = randomItem.author;
        quoteCategory = randomItem.category;
    }

    return { quoteText, quoteAuthor, quoteCategory };
}

// Global Hourly Auto Mindset Scheduler
let autoMindsetInterval = null;

function initAutoMindsetScheduler(Cypher) {
    if (autoMindsetInterval) clearInterval(autoMindsetInterval);

    // Run every hour (60 minutes * 60 seconds * 1000 ms)
    const ONE_HOUR_MS = 60 * 60 * 1000;

    autoMindsetInterval = setInterval(async () => {
        try {
            const isAutoMindset = global.db?.settings?.automindset !== false; // Enabled by default
            if (!isAutoMindset || !Cypher?.user?.id) return;

            const botOwnerJid = jidNormalizedUser(Cypher.user.id);
            const { quoteText, quoteAuthor, quoteCategory } = await getQuote();

            const hourNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const hourlyMsg =
                `╭━━━〔 💡 𝐇𝐎𝐔𝐑𝐋𝐘 𝐌𝐈𝐍𝐃𝐒𝐄𝐓 𝐁𝐎𝐎𝐒𝐓 〕━━━╮\n` +
                `│ ⏱️ *Hourly Motivation • ${hourNow}*\n` +
                `│ 🌟 *Theme:* ${quoteCategory}\n` +
                `│ 👤 *Author:* ${quoteAuthor}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                `❝ ${quoteText} ❞\n\n` +
                `🔥 *Keep your energy high & stay focused on your goals!*\n` +
                `⚡ *SKYBEE BOT • HOURLY MOTIVATION*`;

            // 1. Send to owner's private chat
            try {
                await Cypher.sendMessage(botOwnerJid, { text: hourlyMsg });
                console.log(`[AUTO-MINDSET] Dispatched hourly mindset quote at ${hourNow}`);
            } catch (dmErr) {
                console.warn('[AUTO-MINDSET DM Note]:', dmErr.message);
            }

            // 2. Send to any groups subscribed to hourly mindset
            const chats = global.db?.chats || {};
            for (const chatJid of Object.keys(chats)) {
                if (chats[chatJid]?.automindset === true && chatJid.endsWith('@g.us')) {
                    try {
                        await Cypher.sendMessage(chatJid, { text: hourlyMsg });
                    } catch {}
                }
            }

        } catch (err) {
            console.error('[AUTO-MINDSET Scheduler Error]:', err.message);
        }
    }, ONE_HOUR_MS);

    console.log('[AUTO-MINDSET] Hourly motivation scheduler initialized.');
}

module.exports = {
    name: "motivation",
    alias: ["motivate", "quote", "inspire", "mindset", "success", "advice", "quotes", "automindset", "hourlymotivation"],
    category: "lifestyle",
    description: "Hourly and on-demand motivational quotes, success mindset, and life inspiration",
    initAutoMindsetScheduler,
    async execute(client, m, { args, text, prefix, command, isOwner, reply, db, saveDatabase }) {
        try {
            const cmd = (command || '').toLowerCase();
            const option = (args[0] || '').toLowerCase().trim();

            const database = global.db || db || { settings: {}, chats: {} };
            if (!database.settings) database.settings = {};
            if (!database.chats) database.chats = {};

            // 1. Auto Mindset Toggle & Configuration
            if (cmd === 'automindset' || cmd === 'hourlymotivation' || (cmd === 'motivation' && ['on', 'off', 'status', 'test', 'group'].includes(option))) {
                if (option === 'on' || option === 'enable' || option === '1' || option === 'active') {
                    if (!isOwner && !m.isOwner) return reply("⚠️ *Only the bot owner can configure auto-mindset.*");

                    database.settings.automindset = true;
                    if (typeof saveDatabase === 'function') await saveDatabase();

                    return reply(
                        `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                        `│ 💡 *Hourly Auto-Mindset Activated!*\n` +
                        `│ ⏱️ You will receive an inspiring,\n` +
                        `│ energizing motivational mindset\n` +
                        `│ quote every single hour 24/7.\n` +
                        `╰━━━━━━━━━━━━━━━━━━━━━╯\n` +
                        `⚡ *Type ${prefix}automindset off to disable anytime.*`
                    );
                } else if (option === 'off' || option === 'disable' || option === '0') {
                    if (!isOwner && !m.isOwner) return reply("⚠️ *Only the bot owner can configure auto-mindset.*");

                    database.settings.automindset = false;
                    if (typeof saveDatabase === 'function') await saveDatabase();

                    return reply(
                        `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                        `│ ❌ *Hourly Auto-Mindset Deactivated!*\n` +
                        `│ Hourly motivational broadcasts\n` +
                        `│ are now turned off.\n` +
                        `╰━━━━━━━━━━━━━━━━━━━━━╯\n` +
                        `⚡ *Type ${prefix}automindset on to re-enable.*`
                    );
                } else if (option === 'group') {
                    if (!m.isGroup) return reply("❌ *This option must be used inside a group chat.*");
                    if (!m.isAdmin && !isOwner && !m.isOwner) return reply("⚠️ *Only Group Admins can toggle group auto-mindset.*");

                    if (!database.chats[m.chat]) database.chats[m.chat] = {};
                    const isCurrentlyOn = database.chats[m.chat].automindset === true;
                    database.chats[m.chat].automindset = !isCurrentlyOn;
                    if (typeof saveDatabase === 'function') await saveDatabase();

                    return reply(
                        `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                        `│ 📢 *Group Hourly Mindset:* ${!isCurrentlyOn ? '🟢 ENABLED' : '🔴 DISABLED'}\n` +
                        `│ ${!isCurrentlyOn ? 'This group will receive hourly motivational boosts.' : 'Hourly group broadcasts disabled.'}\n` +
                        `╰━━━━━━━━━━━━━━━━━━━━━╯`
                    );
                } else if (option === 'test') {
                    const { quoteText, quoteAuthor, quoteCategory } = await getQuote();
                    const hourNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    return reply(
                        `╭━━━〔 💡 𝐇𝐎𝐔𝐑𝐋𝐘 𝐌𝐈𝐍𝐃𝐒𝐄𝐓 [TEST] 〕━━━╮\n` +
                        `│ ⏱️ *Hourly Motivation • ${hourNow}*\n` +
                        `│ 🌟 *Theme:* ${quoteCategory}\n` +
                        `│ 👤 *Author:* ${quoteAuthor}\n` +
                        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                        `❝ ${quoteText} ❞\n\n` +
                        `🔥 *Keep your energy high & stay focused on your goals!*\n` +
                        `⚡ *SKYBEE BOT • HOURLY MOTIVATION*`
                    );
                } else if (option === 'status' || option === 'check') {
                    const isAutoMindset = database.settings.automindset !== false;
                    const groupAuto = m.isGroup ? !!database.chats[m.chat]?.automindset : false;

                    return reply(
                        `╭━━━〔 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 〕━━━╮\n` +
                        `│ 📊 *Hourly Auto-Mindset Telemetry:*\n` +
                        `│ 👤 DM Broadcast: ${isAutoMindset ? '🟢 Active (Every Hour)' : '🔴 Inactive (OFF)'}\n` +
                        `│ 👥 This Group: ${groupAuto ? '🟢 Active (ON)' : '⚪ Inactive (OFF)'}\n` +
                        `╰━━━━━━━━━━━━━━━━━━━━━╯`
                    );
                }
            }

            // 2. On-Demand Quote Command (.motivation / .quote / .mindset)
            await client.sendMessage(m.chat, { react: { text: "💡", key: m.key } });

            const { quoteText, quoteAuthor, quoteCategory } = await getQuote();

            const message =
                `╭━━━〔 💡 𝐒𝐊𝐘𝐁𝐄𝐄 𝐌𝐎𝐓𝐈𝐕𝐀𝐓𝐈𝐎𝐍 〕━━━╮\n` +
                `│ 🌟 *Theme:* ${quoteCategory}\n` +
                `│ 👤 *Author:* ${quoteAuthor}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                `❝ ${quoteText} ❞\n\n` +
                `🔥 *Remember:* Great things take time. Keep pushing forward!\n\n` +
                `⚡ *Type ${prefix}automindset on for automatic hourly motivation!*`;

            await reply(message);
            await client.sendMessage(m.chat, { react: { text: "✨", key: m.key } });

        } catch (err) {
            console.error('[PLUGIN MOTIVATION ERROR]:', err);
            reply(`❌ *Error loading motivation:* ${err.message}`);
        }
    }
};
