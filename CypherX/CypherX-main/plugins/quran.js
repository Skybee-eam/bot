const axios = require('axios');

module.exports = {
    name: "quran",
    alias: ["surah", "ayah", "dailyayah", "quranaudio", "koran"],
    category: "religion",
    description: "Look up Holy Quran Surahs, Ayahs with Arabic calligraphy, English translation, and audio recitation",
    async execute(client, m, { args, text, prefix, command, reply }) {
        try {
            const cmd = (command || '').toLowerCase();
            const query = (text || '').trim();

            // 1. Daily Ayah / Random Quranic Inspiration
            if (cmd === 'dailyayah' || query === 'daily' || query === 'random') {
                const popularAyahs = [
                    "2:255", "1:1", "1:2", "1:3", "1:4", "1:5", "1:6", "1:7",
                    "36:1", "36:2", "36:3", "67:1", "67:2", "112:1", "112:2",
                    "112:3", "112:4", "113:1", "114:1", "93:1", "93:2", "93:3",
                    "94:5", "94:6", "55:13", "3:139", "2:286", "2:186", "49:13"
                ];
                const randomRef = popularAyahs[Math.floor(Math.random() * popularAyahs.length)];
                return fetchAndSendAyah(client, m, randomRef, prefix, reply, true);
            }

            // 2. Audio Recitation Command
            if (cmd === 'quranaudio') {
                if (!query) {
                    return reply(`💡 *Usage:* ${prefix}quranaudio <surah:ayah>\n*Example:* ${prefix}quranaudio 1:1 or ${prefix}quranaudio 2:255 (Ayatul Kursi)`);
                }
                return sendQuranAudio(client, m, query, reply);
            }

            // 3. Guide if empty
            if (!query) {
                return reply(
                    `╭━━━〔 📖 𝐓𝐇𝐄 𝐇𝐎𝐋𝐘 𝐐𝐔𝐑𝐀𝐍 〕━━━╮\n` +
                    `│ ☪️ *Quranic Explorer Guide*\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                    `📌 *Available Commands:*\n` +
                    `• *${prefix}quran 1:1* (Surah:Ayah lookup)\n` +
                    `• *${prefix}quran 2:255* (Ayatul Kursi)\n` +
                    `• *${prefix}quran 112:1-4* (Surah Al-Ikhlas)\n` +
                    `• *${prefix}surah 114* (Surah details)\n` +
                    `• *${prefix}quranaudio 1:1* (Listen to MP3 recitation)\n` +
                    `• *${prefix}dailyayah* (Inspirational Ayah of the Day)`
                );
            }

            await client.sendMessage(m.chat, { react: { text: "📖", key: m.key } });

            // 4. Surah or Ayah lookup
            return fetchAndSendAyah(client, m, query, prefix, reply, false);

        } catch (err) {
            console.error('[PLUGIN QURAN ERROR]:', err);
            reply(`❌ *Error loading Quran:* ${err.message}`);
        }
    }
};

async function fetchAndSendAyah(client, m, query, prefix, reply, isDaily = false) {
    try {
        let cleanQuery = query.replace(/^surah\s*/i, '').trim();

        // Check if query is formatted as "surah:ayah" (e.g. 2:255 or 1:1)
        if (cleanQuery.includes(':')) {
            const [surahNum, ayahNum] = cleanQuery.split(':').map(s => s.trim());

            // Fetch Arabic text + English translation simultaneously
            const [arRes, enRes] = await Promise.all([
                axios.get(`https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/ar.alafasy`),
                axios.get(`https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/en.sahih`)
            ]);

            const arabicData = arRes.data?.data;
            const englishData = enRes.data?.data;

            if (!arabicData || !englishData) {
                return reply(`❌ *Ayah not found:* ${cleanQuery}`);
            }

            const surahInfo = arabicData.surah;
            const audioUrl = arabicData.audio;

            const responseText =
                `╭━━━〔 📖 𝐓𝐇𝐄 𝐇𝐎𝐋𝐘 𝐐𝐔𝐑𝐀𝐍 〕━━━╮\n` +
                `│ 🕌 *Surah:* ${surahInfo.englishName} (${surahInfo.name})\n` +
                `│ 🏷️ *Meaning:* ${surahInfo.englishNameTranslation}\n` +
                `│ 🔢 *Ayah:* ${arabicData.numberInSurah} of ${surahInfo.numberOfAyahs} | Juz ${arabicData.juz}\n` +
                `│ 🕋 *Revelation:* ${surahInfo.revelationType}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                `📜 *Arabic:*\n` +
                `﷽\n` +
                `*${arabicData.text}*\n\n` +
                `📝 *English Translation:*\n` +
                `❝ ${englishData.text} ❞\n\n` +
                `🎧 *Recitation:* Mishary Rashid Alafasy\n` +
                `⚡ *Type ${prefix}quranaudio ${cleanQuery} to receive the audio MP3!*`;

            await reply(responseText);
            await client.sendMessage(m.chat, { react: { text: "✨", key: m.key } });
            return;
        }

        // If query is just a Surah number (e.g. 112, 1, 36)
        const surahInt = parseInt(cleanQuery, 10);
        if (!isNaN(surahInt) && surahInt >= 1 && surahInt <= 114) {
            const res = await axios.get(`https://api.alquran.cloud/v1/surah/${surahInt}/en.sahih`);
            const s = res.data?.data;

            if (s) {
                const sampleAyah = s.ayahs && s.ayahs[0] ? s.ayahs[0].text : '';
                return reply(
                    `╭━━━〔 📖 𝐒𝐔𝐑𝐀𝐇 ${s.number}: ${s.englishName.toUpperCase()} 〕━━━╮\n` +
                    `│ 🕌 *Arabic Name:* ${s.name}\n` +
                    `│ 🏷️ *Translation:* ${s.englishNameTranslation}\n` +
                    `│ 🔢 *Total Ayahs:* ${s.numberOfAyahs}\n` +
                    `│ 🕋 *Type:* ${s.revelationType}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                    `📜 *First Ayah (English):*\n❝ ${sampleAyah} ❞\n\n` +
                    `⚡ *To read specific verse: ${prefix}quran ${s.number}:1*`
                );
            }
        }

        // Fallback search
        const searchRes = await axios.get(`https://api.alquran.cloud/v1/search/${encodeURIComponent(cleanQuery)}/all/en`);
        const matches = searchRes.data?.data?.matches;

        if (matches && matches.length > 0) {
            const first = matches[0];
            return reply(
                `╭━━━〔 📖 𝐐𝐔𝐑𝐀𝐍 𝐒𝐄𝐀𝐑𝐂𝐇 〕━━━╮\n` +
                `│ 🔍 *Query:* "${cleanQuery}"\n` +
                `│ 🕌 *Surah:* ${first.surah.englishName} (${first.surah.number}:${first.numberInSurah})\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                `❝ ${first.text} ❞\n\n` +
                `⚡ *Found ${matches.length} matching verses.*`
            );
        }

        return reply(`❌ *Could not find:* "${query}".\n💡 *Tip:* Use format *${prefix}quran 2:255* or *${prefix}surah 112*.`);

    } catch (err) {
        return reply(`❌ *Ayah lookup error:* Please verify the reference (e.g. *${prefix}quran 1:1* or *${prefix}quran 2:255*).`);
    }
}

async function sendQuranAudio(client, m, query, reply) {
    try {
        const [surahNum, ayahNum] = query.replace(/^surah\s*/i, '').trim().split(':').map(s => s.trim());
        if (!surahNum || !ayahNum) {
            return reply(`💡 *Usage:* .quranaudio <surah:ayah> (e.g. *.quranaudio 1:1* or *.quranaudio 2:255*)`);
        }

        const res = await axios.get(`https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/ar.alafasy`);
        const data = res.data?.data;

        if (!data || !data.audio) {
            return reply(`❌ *Audio recitation not available for:* ${query}`);
        }

        await client.sendMessage(m.chat, { react: { text: "🎧", key: m.key } });

        await client.sendMessage(m.chat, {
            audio: { url: data.audio },
            mimetype: 'audio/mp4',
            ptt: true
        }, { quoted: m });

    } catch (err) {
        reply(`❌ *Could not load Quran audio:* ${err.message}`);
    }
}
