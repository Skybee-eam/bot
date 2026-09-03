const fs = require('fs');
const path = require('path');

module.exports = {
    name: "clearsession",
    alias: ["clearsessions", "cleansession", "cleansessions", "purgesession", "purgesessions", "sessionclean", "delsession", "cleartemp"],
    category: "owner",
    description: "Cleans up stale pre-keys, junk peer sessions, and temporary files safely without logging out",
    async execute(client, m, { prefix, command, reply, isOwner, args }) {
        if (!m.isOwner && !isOwner) {
            return reply("⚠️ *This command can only be used by the bot owner.*");
        }

        try {
            // 1. Resolve active session directory
            const possibleDirs = [
                global.authDir,
                process.env.BOT_SESSION_DIR,
                path.join(__dirname, '..', 'session'),
                path.join(__dirname, '..', 'src', 'Session'),
                path.join(process.cwd(), 'session'),
                path.join(process.cwd(), 'src', 'Session')
            ].filter(Boolean);

            let authDir = null;
            for (const dir of possibleDirs) {
                if (fs.existsSync(path.join(dir, 'creds.json'))) {
                    authDir = dir;
                    break;
                }
            }

            // Fallback: check cloud_sessions subdirectories
            if (!authDir) {
                const cloudSessionsDir = path.join(__dirname, '..', 'cloud_sessions');
                if (fs.existsSync(cloudSessionsDir)) {
                    const subs = fs.readdirSync(cloudSessionsDir);
                    for (const sub of subs) {
                        const subPath = path.join(cloudSessionsDir, sub);
                        if (fs.statSync(subPath).isDirectory() && fs.existsSync(path.join(subPath, 'creds.json'))) {
                            authDir = subPath;
                            break;
                        }
                    }
                }
            }

            if (!authDir || !fs.existsSync(authDir)) {
                return reply("❌ *Could not locate active session directory on the server.*");
            }

            const now = Date.now();
            const isForceAll = args && (args[0] === 'all' || args[0] === 'force' || args[0] === 'full');
            const MAX_AGE_MS = isForceAll ? 0 : (6 * 60 * 60 * 1000); // 6 hours

            const files = fs.readdirSync(authDir);
            let purgedCount = 0;
            let activeCount = 0;
            let bytesFreed = 0;

            for (const file of files) {
                // CRITICAL SAFETY CHECK: NEVER delete creds.json, sync keys, or group encryption sender-keys
                if (
                    file === 'creds.json' ||
                    file.startsWith('app-state-sync') ||
                    file.startsWith('sender-key') ||
                    file.startsWith('session-')
                ) {
                    activeCount++;
                    continue;
                }

                const filePath = path.join(authDir, file);
                try {
                    const stats = fs.statSync(filePath);
                    // Only safely clean consumed pre-keys (pre-key-*.json)
                    if (file.startsWith('pre-key-')) {
                        if (isForceAll || (now - stats.mtimeMs > MAX_AGE_MS)) {
                            bytesFreed += stats.size;
                            fs.unlinkSync(filePath);
                            purgedCount++;
                        } else {
                            activeCount++;
                        }
                    } else {
                        activeCount++;
                    }
                } catch {}
            }

            // 2. Also clean temporary files in tmp directories
            let tmpPurged = 0;
            const tmpDirs = [
                path.join(__dirname, '..', 'tmp'),
                path.join(__dirname, '..', 'temp')
            ];

            for (const tDir of tmpDirs) {
                if (fs.existsSync(tDir)) {
                    try {
                        const tmpFiles = fs.readdirSync(tDir);
                        for (const tf of tmpFiles) {
                            try {
                                const tfPath = path.join(tDir, tf);
                                const stats = fs.statSync(tfPath);
                                bytesFreed += stats.size;
                                fs.unlinkSync(tfPath);
                                tmpPurged++;
                            } catch {}
                        }
                    } catch {}
                }
            }

            const kbFreed = (bytesFreed / 1024).toFixed(1);
            const mbFreed = (bytesFreed / (1024 * 1024)).toFixed(2);
            const sizeStr = bytesFreed > 1024 * 1024 ? `${mbFreed} MB` : `${kbFreed} KB`;

            const resMsg = `╭━━━〔 🧹 *SESSION & CACHE CLEANER* 〕━━━╮\n` +
                           `│ 🗑️ *Purged Session Files:* ${purgedCount} files\n` +
                           `│ 📦 *Purged Temp Cache:* ${tmpPurged} files\n` +
                           `│ 💾 *Disk Space Freed:* ${sizeStr}\n` +
                           `│ 🔒 *Active Auth Kept:* ${activeCount} files\n` +
                           `│ 🛡️ *Core Identity (creds.json):* Protected & Safe\n` +
                           `│ 🤖 *Bot Status:* 🟢 Healthy & Optimized\n` +
                           `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                           `✨ *Tip:* Type *${prefix}clearsession all* to force-purge all expired pre-keys.`;

            await client.sendMessage(m.chat, { text: resMsg }, { quoted: m });
            try {
                await client.sendMessage(m.chat, { react: { text: "🧹", key: m.key } });
            } catch {}

        } catch (error) {
            console.error('[ClearSessions Plugin Error]:', error);
            reply(`❌ *Session cleanup failed:* ${error.message}`);
        }
    }
};
