const axios = require('axios');

module.exports = {
    name: "bible",
    alias: ["verse", "scripture", "dailyverse", "bibleverse"],
    category: "religion",
    description: "Look up Holy Bible scriptures, verses, and daily inspirational quotes",
    async execute(client, m, { args, text, prefix, command, reply }) {
        try {
            const cmd = (command || '').toLowerCase();
            const query = (text || '').trim();

            // 1. Daily Verse / Random Verse
            if (cmd === 'dailyverse' || query === 'daily' || query === 'random' || (!query && cmd === 'verse')) {
                const popularVerses = [
                    "John 3:16", "Philippians 4:13", "Psalm 23:1-6", "Jeremiah 29:11",
                    "Proverbs 3:5-6", "Romans 8:28", "Isaiah 40:31", "Matthew 6:33",
                    "Joshua 1:9", "Psalm 46:1", "1 Corinthians 13:4-7", "Romans 12:2",
                    "Galatians 5:22-23", "Ephesians 2:8-9", "Psalm 91:1-2", "2 Timothy 1:7",
                    "Hebrews 11:1", "James 1:2-3", "Psalm 121:1-2", "Matthew 11:28"
                ];
                const randomRef = popularVerses[Math.floor(Math.random() * popularVerses.length)];
                
                const res = await axios.get(`https://bible-api.com/${encodeURIComponent(randomRef)}`);
                const data = res.data;

                return reply(
                    `╭━━━〔 📖 𝐇𝐎𝐋𝐘 𝐁𝐈𝐁𝐋𝐄 〕━━━╮\n` +
                    `│ ✨ *VERSE OF THE DAY*\n` +
                    `│ 📜 *Reference:* ${data.reference}\n` +
                    `│ 🏷️ *Translation:* ${data.translation_name || 'King James Version (KJV)'}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                    `❝ ${data.text.trim()} ❞\n\n` +
                    `⚡ *Type ${prefix}bible <book chapter:verse> for any verse!*`
                );
            }

            // 2. Specific Scripture Lookup
            if (!query) {
                return reply(
                    `╭━━━〔 📖 𝐇𝐎𝐋𝐘 𝐁𝐈𝐁𝐋𝐄 〕━━━╮\n` +
                    `│ ✝️ *Scripture Search Guide*\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                    `📌 *Usage Examples:*\n` +
                    `• *${prefix}bible John 3:16*\n` +
                    `• *${prefix}bible Psalm 23:1-6*\n` +
                    `• *${prefix}bible Genesis 1:1*\n` +
                    `• *${prefix}bible Romans 8:28*\n` +
                    `• *${prefix}dailyverse* (Random inspirational verse)`
                );
            }

            await client.sendMessage(m.chat, { react: { text: "📖", key: m.key } });

            try {
                const url = `https://bible-api.com/${encodeURIComponent(query)}`;
                const response = await axios.get(url);
                const result = response.data;

                if (!result || !result.text) {
                    return reply(`❌ *Could not find scripture:* "${query}". Please check the book name, chapter, and verse.`);
                }

                const cleanText = result.text.trim();
                const versesCount = result.verses ? result.verses.length : 1;

                const responseMsg =
                    `╭━━━〔 📖 𝐇𝐎𝐋𝐘 𝐁𝐈𝐁𝐋𝐄 〕━━━╮\n` +
                    `│ 📜 *Reference:* ${result.reference}\n` +
                    `│ 🏷️ *Version:* ${result.translation_name || 'World English Bible (WEB)'}\n` +
                    `│ 🔢 *Verses:* ${versesCount}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                    `❝ ${cleanText} ❞\n\n` +
                    `🐝 *SKYBEE BOT • SCRIPTURE PORTAL*`;

                await reply(responseMsg);
                await client.sendMessage(m.chat, { react: { text: "✨", key: m.key } });

            } catch (apiErr) {
                // Fallback attempt with KJV parameter
                try {
                    const fallbackUrl = `https://bible-api.com/${encodeURIComponent(query)}?translation=kjv`;
                    const fbRes = await axios.get(fallbackUrl);
                    const fbData = fbRes.data;

                    if (fbData && fbData.text) {
                        return reply(
                            `╭━━━〔 📖 𝐇𝐎𝐋𝐘 𝐁𝐈𝐁𝐋𝐄 (KJV) 〕━━━╮\n` +
                            `│ 📜 *Reference:* ${fbData.reference}\n` +
                            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                            `❝ ${fbData.text.trim()} ❞`
                        );
                    }
                } catch {}

                return reply(`❌ *Could not locate "${query}".*\n💡 *Tip:* Check the spelling (e.g. *${prefix}bible John 3:16* or *${prefix}bible Psalm 23:1-4*).`);
            }

        } catch (err) {
            console.error('[PLUGIN BIBLE ERROR]:', err);
            reply(`❌ *Error loading Bible verse:* ${err.message}`);
        }
    }
};
