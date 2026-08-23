const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

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

class PluginManager {
  constructor(directories) {
    this.directories = Array.isArray(directories) ? directories : [directories];
    this.pluginsCache = new Map();
    this.commandMap = new Map();
    this.categorizedCommands = new Map();
    this.watchers = [];
    this.initWatchers();
  }

  initWatchers() {
    for (const dir of this.directories) {
      if (fs.existsSync(dir)) {
        try {
          const watcher = fs.watch(dir, async (eventType, filename) => {
            if (filename && filename.endsWith('.js')) {
              console.log(`[CYPHER-X] Plugin change detected (${filename}): Live reloading plugins...`);
              await this.loadAllPlugins();
            }
          });
          this.watchers.push(watcher);
        } catch (err) {
          console.log(`[CYPHER-X] Watcher notice for ${dir}:`, err.message);
        }
      }
    }
  }

  async getPluginFiles(dir) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
      return [];
    }
    try {
      const files = await fsp.readdir(dir);
      return files
        .filter(file => file.endsWith('.js'))
        .map(file => path.join(dir, file));
    } catch {
      return [];
    }
  }

  getCategoryFromPath(filePath, pluginCategory) {
    if (pluginCategory) {
      const cat = String(pluginCategory).trim().toLowerCase();
      const map = {
        'ai': '🤖 AI & Chatbots',
        'audio': '🎵 Audio & Voice FX',
        'download': '📥 Media Downloaders',
        'owner': '👑 Owner & Core Management',
        'group': '👥 Group Administration',
        'tools': '🛠️ Utilities & Tools',
        'fun': '🎮 Fun & Entertainment',
        'general': '⚡ General & Performance',
        'reaction': '🎭 Anime & Reactions',
        'react': '❤️ Emoji Reactions',
        'settings': '⚙️ Settings & System',
        'search': '🔍 Search & Information',
        'convert': '🔄 Media Converters',
        'maker': '🎨 Canvas & Makers',
        'stalk': '🔎 Stalk & Lookup'
      };
      return map[cat] || `📦 ${cat.charAt(0).toUpperCase() + cat.slice(1)}`;
    }

    const basename = path.basename(filePath, '.js').toLowerCase();
    const map = {
      'ai': '🤖 AI & Chatbots',
      'audio': '🎵 Audio & Voice FX',
      'download': '📥 Media Downloaders',
      'downloader': '📥 Media Downloaders',
      'tiktok': '📥 Media Downloaders',
      'ig': '📥 Media Downloaders',
      'play': '📥 Media Downloaders',
      'owner': '👑 Owner & Core Management',
      'group': '👥 Group Administration',
      'tagall': '👥 Group Administration',
      'tools': '🛠️ Utilities & Tools',
      'vv': '🛠️ Utilities & Tools',
      'sticker': '🎨 Canvas & Makers',
      'tomp3': '🎵 Audio & Voice FX',
      'fun': '🎮 Fun & Entertainment',
      'reaction': '🎭 Anime & Reactions',
      'react': '❤️ Emoji Reactions',
      'ping': '⚡ General & Performance',
      'alive': '⚡ General & Performance',
      'settings': '⚙️ Settings & System',
      'search': '🔍 Search & Information',
      'convert': '🔄 Media Converters',
      'maker': '🎨 Canvas & Makers',
      'stalk': '🔎 Stalk & Lookup',
      'main': '⚡ General & Performance'
    };
    return map[basename] || `📦 ${basename.charAt(0).toUpperCase() + basename.slice(1)}`;
  }

  async loadAllPlugins() {
    try {
      this.pluginsCache.clear();
      this.commandMap.clear();
      this.categorizedCommands.clear();

      let totalFiles = 0;

      for (const dir of this.directories) {
        const pluginFiles = await this.getPluginFiles(dir);
        totalFiles += pluginFiles.length;

        for (const filePath of pluginFiles) {
          delete require.cache[require.resolve(filePath)];
          try {
            const pluginExport = require(filePath);
            const plugins = Array.isArray(pluginExport) ? pluginExport : [pluginExport];

            this.pluginsCache.set(filePath, plugins);

            for (const plugin of plugins) {
              if (!plugin) continue;

              let category = this.getCategoryFromPath(filePath, plugin.category);
              if (!this.categorizedCommands.has(category)) {
                this.categorizedCommands.set(category, new Set());
              }

              // Collect all command triggers: command array, name, alias
              let triggers = [];

              if (plugin.command) {
                if (Array.isArray(plugin.command)) triggers.push(...plugin.command);
                else triggers.push(plugin.command);
              }

              if (plugin.name) {
                triggers.push(plugin.name);
              }

              if (plugin.alias) {
                if (Array.isArray(plugin.alias)) triggers.push(...plugin.alias);
                else triggers.push(plugin.alias);
              }

              // Deduplicate & normalize triggers
              triggers = [...new Set(triggers.map(t => String(t).toLowerCase().trim()))];

              for (const cmd of triggers) {
                if (cmd) {
                  this.commandMap.set(cmd, { plugin, filePath, category });
                  this.categorizedCommands.get(category).add(cmd);
                }
              }
            }
          } catch (err) {
            console.error(`❌ Error loading plugin file ${filePath}:`, err.message);
          }
        }
      }

      console.log(`[CYPHER-X] Plugins loaded: ${totalFiles} files across directories`);
      console.log(`[CYPHER-X] Commands loaded: ${this.commandMap.size}`);
      return true;

    } catch (error) {
      console.error('❌ Error in loadAllPlugins:', error);
      return false;
    }
  }

  // Premium UI Design for WhatsApp Chat Interfaces
  generateDynamicMenu(prefix = '.', query = '', pushName = 'User') {
    const categories = Array.from(this.categorizedCommands.keys()).sort();
    const totalCommands = this.commandMap.size;
    const uptime = formatUptime(Date.now() - START_TIME);
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const queryClean = (query || '').trim().toLowerCase();
    const numericIndex = parseInt(queryClean, 10);

    let targetCategory = null;
    if (!isNaN(numericIndex) && numericIndex >= 1 && numericIndex <= categories.length) {
      targetCategory = categories[numericIndex - 1];
    } else if (queryClean && queryClean !== 'all' && queryClean !== 'full') {
      targetCategory = categories.find(c => c.toLowerCase().includes(queryClean));
    }

    // ─────────────────────────────────────────────
    // 1. SINGLE CATEGORY EXPANDED VIEW
    // ─────────────────────────────────────────────
    if (targetCategory) {
      const cmds = Array.from(this.categorizedCommands.get(targetCategory)).sort();
      let menuStr = `┌───「 🐉 𝐑𝐄𝐃 𝐃𝐑𝐀𝐆𝐎𝐍 𝐎𝐅𝐂 🐉 」───┐\n` +
                    `│ 📂 *Category:* ${targetCategory}\n` +
                    `│ 📊 *Total Commands:* ${cmds.length}\n` +
                    `│ ⚡ *Prefix:* [ ${prefix} ]\n` +
                    `└───「 ᴄʏᴘʜᴇʀ-x ᴇxᴇᴄᴜᴛɪᴠᴇ 」───┘\n\n` +
                    `╭───『 📋 *COMMAND DIRECTORY* 』\n`;

      for (let i = 0; i < cmds.length; i++) {
        const num = (i + 1).toString().padStart(2, '0');
        menuStr += `│ ◈ *${prefix}${cmds[i]}*\n`;
      }
      menuStr += `╰──────────────────────────────\n\n` +
                 `💡 *Tip:* Type *${prefix}menu* to return to the Main Dashboard.`;
      return menuStr;
    }

    // ─────────────────────────────────────────────
    // 2. FULL COMPLETE COMMAND LIST (.menu all)
    // ─────────────────────────────────────────────
    // 2. FULL COMPLETE COMMAND LIST (.menu all)
    // ─────────────────────────────────────────────
    if (queryClean === 'all' || queryClean === 'full') {
      let menuStr = `┌───「 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 🐝 」───┐\n` +
                    `│ 👤 ᴜsᴇʀ     : @${pushName}\n` +
                    `│ 👑 ᴏᴡɴᴇʀ    : SKYBEE BOT\n` +
                    `│ 🤖 ʙᴏᴛ      : Skybee Bot MD v2.0\n` +
                    `│ ⚡ ᴘʀᴇғɪx   : [ ${prefix} ]\n` +
                    `│ 📊 ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands} Active\n` +
                    `│ ⏱️ ᴜᴘᴛɪᴍᴇ   : ${uptime}\n` +
                    `│ 📅 ᴅᴀᴛᴇ     : ${dateStr}\n` +
                    `│ 📡 sᴛᴀᴛᴜs   : 🟢 Operational\n` +
                    `└───「 sᴋʏʙᴇᴇ ᴀʟʟ ᴄᴏᴍᴍᴀɴᴅs 」───┘\n\n`;

      for (const cat of categories) {
        const cmds = Array.from(this.categorizedCommands.get(cat)).sort();
        if (cmds.length === 0) continue;

        menuStr += `╭───『 ${cat.toUpperCase()} (${cmds.length}) 』\n`;
        for (const cmd of cmds) {
          menuStr += `│ ◈ *${prefix}${cmd}*\n`;
        }
        menuStr += `╰──────────────────────────────\n\n`;
      }

      menuStr += `📌 *NAVIGATION GUIDE:*\n` +
                 `• Type *${prefix}menu* to return to the Main Dashboard\n` +
                 `• Type *${prefix}menu <number>* (e.g. *${prefix}menu 1*) for single category\n\n` +
                 `🐝 *SKYBEE BOT • CONNECTIVITY AND AUTOMATION*`;
      return menuStr;
    }

    // ─────────────────────────────────────────────
    // 3. MASTER EXECUTIVE DASHBOARD (.menu)
    // ─────────────────────────────────────────────
    let menuStr = `┌───「 🐝 𝐒𝐊𝐘𝐁𝐄𝐄 𝐁𝐎𝐓 🐝 」───┐\n` +
                  `│ 👤 ᴜsᴇʀ     : @${pushName}\n` +
                  `│ 👑 ᴏᴡɴᴇʀ    : SKYBEE BOT\n` +
                  `│ 🤖 ʙᴏᴛ      : Skybee Bot MD v2.0\n` +
                  `│ ⚡ ᴘʀᴇғɪx   : [ ${prefix} ]\n` +
                  `│ 📊 ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands} Active\n` +
                  `│ ⏱️ ᴜᴘᴛɪᴍᴇ   : ${uptime}\n` +
                  `│ 📅 ᴅᴀᴛᴇ     : ${dateStr}\n` +
                  `│ 📡 sᴛᴀᴛᴜs   : 🟢 Operational\n` +
                  `└───「 sᴋʏʙᴇᴇ ᴇxᴇᴄᴜᴛɪᴠᴇ 」───┘\n\n` +
                  `╭───『 🌟 *FEATURED SHOWCASE* 』\n` +
                  `│ 👁️ *View Once:* Reply *.vv* or react *👁️ / ❤️*\n` +
                  `│ 🤖 *AI Query:* *${prefix}ai <prompt>*\n` +
                  `│ 👋 *Welcome:* *${prefix}welcome on* or *${prefix}welcome off*\n` +
                  `│ 🎨 *Image Gen:* *${prefix}imagine <prompt>*\n` +
                  `│ 🎵 *Music DL:* *${prefix}play <song title>*\n` +
                  `│ 📥 *YouTube:* *${prefix}ytmp3* or *${prefix}ytmp4 <url>*\n` +
                  `│ 📱 *TikTok:* *${prefix}tiktok <url>*\n` +
                  `│ 📸 *Instagram:* *${prefix}ig <url>*\n` +
                  `│ ⚡ *Speed Test:* *${prefix}ping* or *${prefix}speed*\n` +
                  `│ 👥 *Group Tag:* *${prefix}tagall* or *${prefix}hidetag*\n` +
                  `╰──────────────────────────────\n\n` +
                  `╭───『 📂 *COMMAND CATEGORIES* 』\n`;

    categories.forEach((cat, index) => {
      const count = this.categorizedCommands.get(cat).size;
      const numPad = (index + 1).toString().padStart(2, '0');
      menuStr += `│ 〖${numPad}〗 ${cat} (${count})\n`;
    });

    menuStr += `╰──────────────────────────────\n\n` +
               `📌 *NAVIGATION GUIDE:*\n` +
               `• Type *${prefix}menu <number>* (e.g. *${prefix}menu 1*) for single category\n` +
               `• Type *${prefix}menu <name>* (e.g. *${prefix}menu audio*) for category\n` +
               `• Type *${prefix}menu all* to view all ${totalCommands} commands\n\n` +
               `🐝 *SKYBEE BOT • CONNECTIVITY AND AUTOMATION*`;

    return menuStr;
  }

  async executePlugin(globalContext, command) {
    try {
      const pluginInfo = this.commandMap.get(command.toLowerCase());

      if (!pluginInfo) {
        return false;
      }

      const { plugin } = pluginInfo;

      if (plugin.react && globalContext.Cypher) {
        try {
          await globalContext.Cypher.sendMessage(globalContext.m.chat, {
            react: {
              text: plugin.react,
              key: globalContext.m.key,
            }
          });
        } catch {}
      }

      // 1. Support standard modular format: execute(client, m, { args, text, prefix, command, isGroup, groupMetadata, ... })
      if (typeof plugin.execute === 'function') {
        const client = globalContext.Cypher;
        const m = globalContext.m;
        const options = {
          args: globalContext.args || [],
          text: globalContext.text || '',
          prefix: globalContext.prefix || '.',
          command: command,
          isGroup: globalContext.m?.isGroup || false,
          groupMetadata: globalContext.groupMetadata || null,
          participants: globalContext.participants || [],
          groupAdmins: globalContext.groupAdmins || [],
          isAdmin: globalContext.isAdmin || false,
          isBotAdmin: globalContext.isBotAdmin || false,
          isOwner: globalContext.isOwner || false,
          quoted: globalContext.quoted || null,
          mime: globalContext.mime || '',
          reply: globalContext.reply || m.reply,
          db: globalContext.db || global.db,
          saveDatabase: globalContext.saveDatabase
        };
        await plugin.execute(client, m, options);
        return true;
      }

      // 2. Support CypherX format: operate(globalContext)
      if (typeof plugin.operate === 'function') {
        await plugin.operate(globalContext);
        return true;
      }

      return false;

    } catch (err) {
      console.error(`❌ Failed to execute command "${command}":`, err);
      if (globalContext.reply) {
        globalContext.reply(`❌ Error executing command *${command}*: ${err.message}`);
      }
      return false;
    }
  }
}

// Support both src/Plugins and root plugins directory
const pluginDirs = [
  path.resolve(__dirname, '../Plugins'),
  path.resolve(__dirname, '../../plugins')
];

const pluginManager = new PluginManager(pluginDirs);
module.exports = pluginManager;