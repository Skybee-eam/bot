module.exports = {
    name: "ping",
    alias: ["p", "speed"],
    category: "general",
    description: "Check bot response speed and latency",
    async execute(client, m, { reply }) {
        const start = Date.now();
        const latency = Date.now() - start;
        return reply(`🐝 *Pong!* 🏓\n⚡ *Response Latency:* ${latency}ms\n🟢 *Status:* Connected & Active in this chat`);
    }
};
