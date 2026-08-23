const axios = require('axios');

/**
 * Searches Wikipedia knowledge engine for real-time accurate answers
 */
async function searchWikipediaKnowledge(query) {
    try {
        const cleanQ = query
            .replace(/^(who is|who was|what is|what are|tell me about|define|explain|where is|capital of|how does|what do you know about)\s+/i, '')
            .replace(/[?.,!]+$/g, '')
            .trim();

        if (!cleanQ || cleanQ.length < 2) return null;

        // 1. Search Wikipedia for matching page title
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQ)}&format=json&utf8=1`;
        const sRes = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'CypherXBot/2.0 (https://github.com/Dark-Xploit/CypherX)' },
            timeout: 6000
        });

        const firstHit = sRes.data?.query?.search?.[0]?.title;
        if (firstHit) {
            // 2. Fetch page summary
            const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstHit)}`;
            const sumRes = await axios.get(summaryUrl, {
                headers: { 'User-Agent': 'CypherXBot/2.0 (https://github.com/Dark-Xploit/CypherX)' },
                timeout: 6000
            });
            if (sumRes.data?.extract && sumRes.data.extract.length > 20) {
                return sumRes.data.extract;
            }
        }
    } catch (e) {
        // Fall through quietly
    }
    return null;
}

/**
 * Conversational intent handler for common chat phrases
 */
function getConversationalReply(prompt) {
    const p = prompt.toLowerCase().trim();
    if (/^(hi|hello|hey|hola|yo|sup|good morning|good evening|good afternoon)\b/i.test(p)) {
        return "Hello! 👋 I'm **Skybee AI**, your personal WhatsApp assistant. How can I help you today? You can ask me any question, chat with me, or type `.imagine <prompt>` to generate images!";
    }
    if (/^(who are you|what is your name|who made you|who created you)\b/i.test(p)) {
        return "I am **Skybee AI**, powered by the Skybee Bot connectivity & automation engine. I can assist you with research, facts, definitions, coding, image generation, and more!";
    }
    if (/^(how are you|how do you do)\b/i.test(p)) {
        return "I'm doing great and ready to assist you! What would you like to explore or learn today?";
    }
    if (/^(thank you|thanks|thx)\b/i.test(p)) {
        return "You're very welcome! Feel free to ask if you need anything else. 😊";
    }
    return null;
}

/**
 * Main AI query processor with multi-tier engine fallback
 */
async function fetchAIResponse(prompt) {
    // Tier 1: Check if conversational greeting
    const quickReply = getConversationalReply(prompt);
    if (quickReply) return quickReply;

    // Tier 2: Check for configured API keys (Groq / OpenRouter / OpenAI / Pollinations)
    const apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || process.env.POLLINATIONS_API_KEY;
    if (apiKey) {
        try {
            const endpoint = process.env.GROQ_API_KEY
                ? 'https://api.groq.com/openai/v1/chat/completions'
                : (process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://gen.pollinations.ai/v1/chat/completions');
            
            const model = process.env.GROQ_API_KEY ? 'llama-3.3-70b-versatile' : 'openai';

            const res = await axios.post(endpoint, {
                model: model,
                messages: [
                    { role: 'system', content: 'You are CypherX AI, a helpful, smart, friendly, and concise WhatsApp AI assistant.' },
                    { role: 'user', content: prompt }
                ]
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            const content = res.data?.choices?.[0]?.message?.content;
            if (content && content.trim()) return content.trim();
        } catch (e) {
            console.log('[AI] Configured API Key call note:', e.message);
        }
    }

    // Tier 3: Pollinations Free AI API (No API key required)
    try {
        const polUrl = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai&system=${encodeURIComponent("You are CypherX AI, a friendly and smart WhatsApp chatbot assistant.")}`;
        const polRes = await axios.get(polUrl, { timeout: 12000 });
        if (polRes.data && typeof polRes.data === 'string' && polRes.data.trim().length > 5) {
            return polRes.data.trim();
        }
    } catch (e) {}

    // Tier 4: Real-time Wikipedia & Knowledge Base Engine (Fast, 100% reliable)
    const wikiResult = await searchWikipediaKnowledge(prompt);
    if (wikiResult) {
        return wikiResult;
    }

    // Tier 5: Fallback conversational response
    return `I received your prompt: *"${prompt}"*.\n\n💡 *Tip:* Ask me any question (e.g. *".ai Who was Albert Einstein?"*) or generate art using *".imagine <prompt>"*!`;
}

module.exports = {
    name: "ai",
    alias: ["gpt", "ask", "gemini", "chatgpt", "bot", "imagine", "chatbot"],
    category: "ai",
    description: "High-speed AI Chatbot and Image generator",
    fetchAIResponse,
    async execute(client, m, { text, prefix, command, reply, isOwner, db, saveDatabase }) {
        try {
            const rawText = (text || '').trim();
            const lowerText = rawText.toLowerCase();

            // 1. Handle `.chatbot on` / `.chatbot off` / `.chatbot status` toggle command
            if (command === 'chatbot') {
                if (lowerText === 'on' || lowerText === 'enable' || lowerText === '1') {
                    if (db && db.settings) db.settings.chatbot = true;
                    if (global.db && global.db.settings) global.db.settings.chatbot = true;
                    if (typeof saveDatabase === 'function') await saveDatabase();
                    return reply(`🤖 *CypherX Auto-Chatbot is now ENABLED!* ✅\n\n_The bot will now automatically chat and reply to incoming messages in DM using AI._`);
                }

                if (lowerText === 'off' || lowerText === 'disable' || lowerText === '0') {
                    if (db && db.settings) db.settings.chatbot = false;
                    if (global.db && global.db.settings) global.db.settings.chatbot = false;
                    if (typeof saveDatabase === 'function') await saveDatabase();
                    return reply(`🤖 *CypherX Auto-Chatbot is now DISABLED.* ❌\n\n_Automatic AI replies in DM are turned off._`);
                }

                if (!rawText || lowerText === 'status') {
                    const isEnabled = Boolean(global.db?.settings?.chatbot);
                    return reply(
                        `🤖 *CYPHER-X CHATBOT CONFIGURATION*\n\n` +
                        `• *Status:* ${isEnabled ? '🟢 ACTIVE (Enabled)' : '🔴 INACTIVE (Disabled)'}\n\n` +
                        `*Commands:*\n` +
                        `• *${prefix}chatbot on* ➔ Enable auto-AI replies in DM\n` +
                        `• *${prefix}chatbot off* ➔ Disable auto-AI replies in DM\n` +
                        `• *${prefix}chatbot <question>* ➔ Ask a direct question to AI\n` +
                        `• *${prefix}ai <question>* ➔ Smart AI assistant\n` +
                        `• *${prefix}imagine <prompt>* ➔ Generate realistic AI art`
                    );
                }
            }

            if (!rawText) {
                return reply(`⚠️ *Please provide a question or prompt, e.g.:*\n${prefix}${command} What is quantum physics?\n\n🎨 *Or generate art:* ${prefix}imagine cybernetic dragon`);
            }

            // 2. Image generation command
            if (command === 'imagine' || rawText.startsWith('draw ') || rawText.startsWith('image ')) {
                const imgPrompt = rawText.replace(/^(draw|image)\s+/i, '');
                await client.sendMessage(m.chat, { react: { text: "🎨", key: m.key } });

                const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imgPrompt)}?width=1024&height=1024&nologo=true`;
                
                const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
                const buffer = Buffer.from(imgRes.data);

                await client.sendMessage(m.chat, {
                    image: buffer,
                    caption: `🎨 *AI Image Generator*\n\n📝 *Prompt:* ${imgPrompt}\n✨ *Powered by Skybee AI*`
                }, m.fromMe ? {} : { quoted: m });

                await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
                return;
            }

            // 3. Text Chat / Conversational AI
            await client.sendMessage(m.chat, { react: { text: "🧠", key: m.key } });

            const aiReply = await fetchAIResponse(rawText);

            if (!aiReply) {
                return reply("❌ *AI service is currently busy. Please try again shortly.*");
            }

            const header = `╭━━━〔 🤖 *SKYBEE AI* 〕━━━╮\n`;
            const footer = `\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;

            await client.sendMessage(m.chat, {
                text: `${header}${aiReply}${footer}`
            }, m.fromMe ? {} : { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "✨", key: m.key } });

        } catch (error) {
            console.error('[AI Plugin Error]:', error);
            reply(`❌ *AI query failed:* ${error.message}`);
        }
    }
};
