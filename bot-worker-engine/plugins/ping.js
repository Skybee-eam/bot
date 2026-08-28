module.exports = {
    name: "ping",
    alias: ["p", "speed"],
    category: "general",
    description: "Check bot response speed and latency",
    async execute(client, m, { args, text, prefix, command }) {
        const start = Date.now();
        const msg = await client.sendMessage(m.chat, { text: "Testing speed..." }, { quoted: m });
        const latency = Date.now() - start;

        await client.sendMessage(m.chat, { 
            text: `Pong! 🏓\n*Latency:* ${latency}ms` 
        }, { quoted: msg });
    }
};
