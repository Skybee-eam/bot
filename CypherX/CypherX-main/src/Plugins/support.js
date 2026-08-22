module.exports = [
  {
  command: ['reportbug'],
  operate: async ({ m, mess, text, Cypher, isCreator, versions, prefix, reply, command, mainOwner }) => {
    if (!isCreator) return reply(mess.owner);
    if (!text) return reply(`Example: ${prefix + command} Hey, play command isn't working`);

    const bugReportMsg = `
*BUG REPORT*

*User*: @${m.sender.split("@")[0]}
*Issue*: ${text}

*Version*: ${versions}
    `;

    const confirmationMsg = `
Hi ${m.pushName},

Your bug report has been forwarded to my developer.
Please wait for a reply.

*Details:*
${bugReportMsg}
    `;

    Cypher.sendMessage(mainOwner, { text: bugReportMsg, mentions: [m.sender] }, { quoted: m });
    Cypher.sendMessage(m.chat, { text: confirmationMsg, mentions: [m.sender] }, { quoted: m });
  }
},
  {
  command: ['request'],
  operate: async ({ m, mess, text, Cypher, isCreator, versions, prefix, command, reply, mainOwner }) => {
    if (!isCreator) return reply(mess.owner);
    if (!text) return reply(`Example: ${prefix + command} I would like a new feature (specify) to be added.`);

    const requestMsg = `
*REQUEST*

*User*: @${m.sender.split("@")[0]}
*Request*: ${text}

*Version*: ${versions}
    `;

    const confirmationMsg = `
Hi ${m.pushName},

Your request has been forwarded to my developer.
Please wait for a reply.

*Details:*
${requestMsg}
    `;

    Cypher.sendMessage(mainOwner, { text: requestMsg, mentions: [m.sender] }, { quoted: m });
    Cypher.sendMessage(m.chat, { text: confirmationMsg, mentions: [m.sender] }, { quoted: m });
  }
},
{
  command: ["helpers", "support"],
  operate: async ({ m, args, reply }) => {
    const search = args.join(" ").toLowerCase();

    const filtered = global.helpersList.filter(helper =>
      !search || helper.country.toLowerCase().includes(search)
    );

    if (!filtered.length) {
      return reply(`❌ No helper found for "${search}".\nTry using: *.helpers* to see all.`);
    }

    filtered.sort((a, b) => a.country.localeCompare(b.country));

    let text = `*🌍 CypherX Verified Helpers*\n\n`;
    filtered.forEach((helper, index) => {
      text += `${index + 1}. ${helper.flag} *${helper.country}*\n   • ${helper.name}: ${helper.number}\n\n`;
    });

    text += `✅ CypherX Team\n`;
    text += `📢 Need general help? Join our support group:\n👉 https://t.me/cypherx_support\n`;
    text += `⚠️ Charges may apply depending on the service provided.`;

    reply(text);
  }
}
]