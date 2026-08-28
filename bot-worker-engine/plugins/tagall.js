module.exports = {
    name: "tagall",
    alias: ["everyone"],
    category: "group",
    description: "Mention all group members",
    async execute(client, m, { isGroup, groupMetadata, text }) {
        if (!isGroup) return m.reply("This command can only be used in groups.");
        
        // Fetch group metadata if not already present
        let participants = [];
        if (groupMetadata && groupMetadata.participants) {
            participants = groupMetadata.participants;
        } else {
            try {
                const meta = await client.groupMetadata(m.chat);
                participants = meta.participants || [];
            } catch {
                return m.reply("Unable to fetch group members.");
            }
        }

        let response = `*Attention Everyone*\n${text ? `*Message:* ${text}\n\n` : "\n"}`;
        
        for (let mem of participants) {
            response += `@${mem.id.split("@")[0]}\n`;
        }

        await client.sendMessage(m.chat, { 
            text: response, 
            mentions: participants.map(a => a.id) 
        }, { quoted: m });
    }
};
