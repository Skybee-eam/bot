const pluginManager = require('../src/Core/executor');

module.exports = {
    name: "menu",
    alias: ["help", "commands", "list", "allmenu"],
    category: "general",
    description: "Returns formatted list of all available commands and bot uptime",
    async execute(client, m, { args, text, prefix, command, reply }) {
        try {
            const menuText = pluginManager.generateDynamicMenu(prefix, text, m.pushName || 'User');
            await client.sendMessage(m.chat, {
                text: menuText
            }, { quoted: m });
        } catch (error) {
            console.error('[Menu Plugin Error]:', error);
            reply(`❌ *Failed to load menu:* ${error.message}`);
        }
    }
};
