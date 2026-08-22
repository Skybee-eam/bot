const axios = require('axios');

module.exports = {
    name: "ai",
    alias: ["gpt", "ask", "gemini", "chatgpt"],
    category: "ai",
    description: "Conversational Artificial Intelligence powered by GPT / Gemini",
    async execute(client, m, { text, prefix, command, reply }) {
        try {
            if (!text) {
                return reply(`⚠️ *Please provide a prompt or question, e.g.:*\n${prefix}${command} Explain quantum computing simply`);
            }

            await client.sendMessage(m.chat, { react: { text: "🧠", key: m.key } });

            let aiResponse = null;
            const endpoints = [
                `https://api.siputzx.my.id/api/ai/gpt3?prompt=${encodeURIComponent(text)}`,
                `https://api.vreden.my.id/api/gpt4?query=${encodeURIComponent(text)}`,
                `https://bk9.fun/ai/chatgpt?q=${encodeURIComponent(text)}`,
                `https://api.siputzx.my.id/api/ai/gemini?prompt=${encodeURIComponent(text)}`
            ];

            for (const endpoint of endpoints) {
                try {
                    const res = await axios.get(endpoint, { timeout: 20000 });
                    aiResponse = res.data?.data || res.data?.result || res.data?.BK9?.response || res.data?.answer;
                    if (aiResponse && typeof aiResponse === 'string') break;
                } catch {}
            }

            if (!aiResponse) {
                return reply("❌ *AI service is currently busy. Please try again shortly.*");
            }

            const header = `╭━━━〔 🤖 *AI ASSISTANT* 〕━━━╮\n`;
            const footer = `\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

            await client.sendMessage(m.chat, {
                text: `${header}${aiResponse.trim()}${footer}`
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "✨", key: m.key } });

        } catch (error) {
            console.error('[AI Plugin Error]:', error);
            reply(`❌ *AI query failed:* ${error.message}`);
        }
    }
};
