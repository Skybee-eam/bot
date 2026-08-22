const axios = require('axios');

module.exports = {
    name: "ai",
    alias: ["gpt", "ask", "gemini", "chatgpt", "bot", "imagine"],
    category: "ai",
    description: "High-speed AI Chat and Image generation powered by Pollinations & GPT-4o",
    async execute(client, m, { text, prefix, command, reply }) {
        try {
            if (!text) {
                return reply(`⚠️ *Please provide a question or prompt, e.g.:*\n${prefix}${command} What is the fastest animal on earth?`);
            }

            // Image generation command
            if (command === 'imagine' || text.startsWith('draw ') || text.startsWith('image ')) {
                const imgPrompt = text.replace(/^(draw|image)\s+/i, '');
                await client.sendMessage(m.chat, { react: { text: "🎨", key: m.key } });

                const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imgPrompt)}?width=1024&height=1024&nologo=true`;
                
                const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 25000 });
                const buffer = Buffer.from(imgRes.data);

                await client.sendMessage(m.chat, {
                    image: buffer,
                    caption: `🎨 *AI Image Generator*\n\n📝 *Prompt:* ${imgPrompt}\n✨ *Powered by Pollinations AI*`
                }, { quoted: m });

                await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
                return;
            }

            // Text Chat / Conversational AI
            await client.sendMessage(m.chat, { react: { text: "🧠", key: m.key } });

            // 1. Primary: Pollinations Text Engine (GPT-4o / Claude)
            let aiReply = null;
            try {
                const res = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(text)}?model=openai`, {
                    timeout: 20000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                if (res.data && typeof res.data === 'string' && res.data.trim().length > 0) {
                    aiReply = res.data.trim();
                }
            } catch (err) {
                console.log('[AI] Pollinations fallback:', err.message);
            }

            // 2. Fallback: Secondary endpoints
            if (!aiReply) {
                const fallbacks = [
                    `https://api.vreden.web.id/api/gpt3?query=${encodeURIComponent(text)}`,
                    `https://api.siputzx.my.id/api/ai/gpt3?prompt=${encodeURIComponent(text)}`
                ];
                for (const fb of fallbacks) {
                    try {
                        const r = await axios.get(fb, { timeout: 10000 });
                        aiReply = r.data?.data || r.data?.result || r.data?.answer;
                        if (aiReply && typeof aiReply === 'string') break;
                    } catch {}
                }
            }

            if (!aiReply) {
                return reply("❌ *AI service is currently busy. Please try again shortly.*");
            }

            const header = `╭━━━〔 🤖 *AI ASSISTANT* 〕━━━╮\n`;
            const footer = `\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

            await client.sendMessage(m.chat, {
                text: `${header}${aiReply}${footer}`
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "✨", key: m.key } });

        } catch (error) {
            console.error('[AI Plugin Error]:', error);
            reply(`❌ *AI query failed:* ${error.message}`);
        }
    }
};
