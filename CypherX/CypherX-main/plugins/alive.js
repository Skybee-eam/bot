const os = require('os');

const START_TIME = Date.now();

function formatUptime(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    let result = [];
    if (days > 0) result.push(`${days}d`);
    if (hours > 0) result.push(`${hours}h`);
    if (minutes > 0) result.push(`${minutes}m`);
    result.push(`${seconds}s`);
    return result.join(' ');
}

module.exports = {
    name: "alive",
    alias: ["status", "info", "botstatus", "system"],
    category: "general",
    description: "Reads Node.js, system memory and bot operational status",
    async execute(client, m, { prefix, reply }) {
        try {
            const memory = process.memoryUsage();
            const ramUsed = (memory.heapUsed / 1024 / 1024).toFixed(2);
            const ramTotal = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
            const uptime = formatUptime(Date.now() - START_TIME);
            const platform = `${os.type()} (${os.arch()})`;

            const aliveMsg = `╭━━━〔 🐉 𝐑𝐄𝐃 𝐃𝐑𝐀𝐆𝐎𝐍 𝐎𝐅𝐂 🐉 〕━━━╮\n` +
                             `┃ 🤖 *Status:* Online & Operational\n` +
                             `┃ ⚡ *Engine:* CypherX Multi-Device\n` +
                             `┃ 👑 *Owner:* RED DRAGON OFC\n` +
                             `┃ ⏱️ *Uptime:* ${uptime}\n` +
                             `┃ 💾 *RAM Usage:* ${ramUsed} MB / ${ramTotal} GB\n` +
                             `┃ 💻 *Platform:* ${platform}\n` +
                             `┃ 📦 *Node.js:* ${process.version}\n` +
                             `┃ ⚡ *Prefix:* [ ${prefix} ]\n` +
                             `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                             `✨ *Type ${prefix}menu to view all available commands!*`;

            await client.sendMessage(m.chat, {
                text: aliveMsg
            }, { quoted: m });
        } catch (error) {
            console.error('[Alive Plugin Error]:', error);
            reply(`❌ *Failed to get system info:* ${error.message}`);
        }
    }
};
