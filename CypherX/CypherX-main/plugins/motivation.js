const axios = require('axios');

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
    }
];

module.exports = {
    name: "motivation",
    alias: ["motivate", "quote", "inspire", "mindset", "success", "advice", "quotes"],
    category: "lifestyle",
    description: "Daily motivational quotes, success mindset, and life inspiration",
    async execute(client, m, { args, text, prefix, command, reply }) {
        try {
            await client.sendMessage(m.chat, { react: { text: "💡", key: m.key } });

            let quoteText = '';
            let quoteAuthor = '';
            let quoteCategory = 'Daily Mindset';

            // Try dynamic online quote APIs
            try {
                const res = await axios.get('https://zenquotes.io/api/random', { timeout: 3500 });
                if (res.data && res.data[0] && res.data[0].q) {
                    quoteText = res.data[0].q.trim();
                    quoteAuthor = res.data[0].a.trim() || 'Unknown';
                }
            } catch {
                // Fallback to local curated quote library
                const randomItem = CURATED_QUOTES[Math.floor(Math.random() * CURATED_QUOTES.length)];
                quoteText = randomItem.quote;
                quoteAuthor = randomItem.author;
                quoteCategory = randomItem.category;
            }

            if (!quoteText) {
                const randomItem = CURATED_QUOTES[Math.floor(Math.random() * CURATED_QUOTES.length)];
                quoteText = randomItem.quote;
                quoteAuthor = randomItem.author;
                quoteCategory = randomItem.category;
            }

            const message =
                `╭━━━〔 💡 𝐒𝐊𝐘𝐁𝐄𝐄 𝐌𝐎𝐓𝐈𝐕𝐀𝐓𝐈𝐎𝐍 〕━━━╮\n` +
                `│ 🌟 *Theme:* ${quoteCategory}\n` +
                `│ 👤 *Author:* ${quoteAuthor}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                `❝ ${quoteText} ❞\n\n` +
                `🔥 *Remember:* Great things take time. Keep pushing forward!\n\n` +
                `⚡ *Type ${prefix}motivation for another inspirational quote.*`;

            await reply(message);
            await client.sendMessage(m.chat, { react: { text: "✨", key: m.key } });

        } catch (err) {
            console.error('[PLUGIN MOTIVATION ERROR]:', err);
            reply(`❌ *Error loading motivation:* ${err.message}`);
        }
    }
};
