module.exports = {
    name: "react",
    alias: ["reaction", "emojireact", "re"],
    category: "general",
    description: "React to a quoted message with any emoji",
    async execute(client, m, { args, text, prefix, command, reply }) {
        try {
            if (!m.quoted) {
                return reply(`⚠️ *Please reply to a message and specify an emoji, e.g.* ${prefix}${command} 🔥`);
            }

            const emoji = text ? text.trim() : (args[0] || "❤️");

            // Send reaction to the quoted message
            await client.sendMessage(m.chat, {
                react: {
                    text: emoji,
                    key: m.quoted.key
                }
            });

            // Automatically delete the command message to keep the chat clean
            try {
                await client.sendMessage(m.chat, { delete: m.key });
            } catch {}

        } catch (error) {
            console.error('[React Plugin Error]:', error);
            reply(`❌ *Failed to react to message:* ${error.message}`);
        }
    }
};
