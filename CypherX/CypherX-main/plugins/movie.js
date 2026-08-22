const axios = require("axios");
const yts = require("yt-search");
const ytdl = require("@distube/ytdl-core");
const scraper = require("@vreden/youtube_scraper");
const fs = require("fs");
const path = require("path");

const tmpDir = path.join(__dirname, "..", "tmp");
if (!fs.existsSync(tmpDir)) {
    try { fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
}

// OMDb key pool
const OMDB_KEYS = ["trilogy", "7a3f8a92", "b8b387c9"];

async function fetchMovieInfo(title) {
    for (const key of OMDB_KEYS) {
        try {
            const res = await axios.get(
                `https://www.omdbapi.com/?apikey=${key}&t=${encodeURIComponent(title)}&plot=full`,
                { timeout: 8000 }
            );
            if (res.data?.Response === "True") return res.data;
        } catch {}
    }
    return null;
}

// Stream a YouTube video to disk and return the file path
async function streamVideoToDisk(videoUrl, filePath, quality) {
    return new Promise((resolve, reject) => {
        const stream = ytdl(videoUrl, {
            filter: "videoandaudio",
            quality: quality || "lowest",
            requestOptions: {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            }
        });

        const fileStream = fs.createWriteStream(filePath);
        let downloaded = 0;

        stream.on("data", chunk => {
            downloaded += chunk.length;
        });

        stream.pipe(fileStream);

        fileStream.on("finish", () => resolve(filePath));
        fileStream.on("error", reject);
        stream.on("error", reject);

        // Safety timeout for very large files — 10 minutes
        setTimeout(() => reject(new Error("Download timeout (10 min)")), 10 * 60 * 1000);
    });
}

// Search for a full movie on YouTube
async function findFullMovieVideo(movieTitle, year) {
    const queries = [
        `${movieTitle} ${year || ""} full movie free`,
        `${movieTitle} full movie english`,
        `${movieTitle} full movie HD`,
        `${movieTitle} complete film`
    ];

    for (const query of queries) {
        try {
            const result = await yts(query);
            if (!result.videos) continue;

            // Filter: must be at least 60 minutes long (full movie) and most views
            const candidates = result.videos.filter(v => v.seconds > 3600);
            if (candidates.length > 0) {
                // Sort by views, pick most viewed
                candidates.sort((a, b) => (b.views || 0) - (a.views || 0));
                return candidates[0];
            }

            // Fallback: look for anything over 45 minutes
            const medCandidates = result.videos.filter(v => v.seconds > 2700);
            if (medCandidates.length > 0) {
                medCandidates.sort((a, b) => (b.views || 0) - (a.views || 0));
                return medCandidates[0];
            }
        } catch {}
    }
    return null;
}

// Format file size
function formatSize(bytes) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

module.exports = {
    name: "movie",
    alias: ["film", "cinema", "imdb", "movieinfo", "moviedl"],
    category: "download",
    description: "Search & download full movies, or get detailed movie information",
    async execute(client, m, { text, prefix, command, reply }) {
        let tempFile = null;

        try {
            if (!text) {
                return reply(
                    `🎬 *RED DRAGON CINEMA HUB*\n\n` +
                    `*Commands:*\n` +
                    `• *${prefix}movie <title>* ➔ Download FULL movie video\n` +
                    `• *${prefix}movieinfo <title>* ➔ Movie details, rating & cast\n\n` +
                    `*Example:* \`${prefix}movie Inception\``
                );
            }

            await client.sendMessage(m.chat, { react: { text: "🎬", key: m.key } });

            const isInfoOnly = command === "movieinfo" || command === "imdb";

            // 1. Fetch Movie Data from OMDb
            const movie = await fetchMovieInfo(text);

            let movieCaption = "";
            let posterUrl = "";

            if (movie) {
                posterUrl = movie.Poster && movie.Poster !== "N/A" ? movie.Poster : "";
                movieCaption =
`🎬 *${movie.Title.toUpperCase()} (${movie.Year})*

⭐ *IMDb:* ${movie.imdbRating}/10  |  🍅 *RT:* ${movie.Ratings?.find(r => r.Source === "Rotten Tomatoes")?.Value || "N/A"}
🎭 *Genre:* ${movie.Genre}
⏱️ *Runtime:* ${movie.Runtime}
📅 *Released:* ${movie.Released}
🌍 *Language:* ${movie.Language}
👤 *Director:* ${movie.Director}
👥 *Cast:* ${movie.Actors}
🏆 *Awards:* ${movie.Awards || "N/A"}

📖 *SYNOPSIS:*
_${movie.Plot || "No plot available."}_

🐉 *RED DRAGON CINEMA STUDIO*`;
            }

            // Info-only mode
            if (isInfoOnly) {
                if (!movie) return reply(`❌ *Movie "${text}" not found.*`);
                if (posterUrl) {
                    await client.sendMessage(m.chat, {
                        image: { url: posterUrl },
                        caption: movieCaption
                    }, { quoted: m });
                } else {
                    await reply(movieCaption);
                }
                await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
                return;
            }

            // 2. Send movie info card while searching for the full video
            if (movie && posterUrl) {
                await client.sendMessage(m.chat, {
                    image: { url: posterUrl },
                    caption: movieCaption + "\n\n_🔍 Searching for full movie stream..._"
                }, { quoted: m });
            } else if (movie) {
                await reply(movieCaption + "\n\n_🔍 Searching for full movie stream..._");
            }

            await client.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

            // 3. Find full movie video on YouTube
            const movieTitle = movie ? movie.Title : text;
            const movieYear = movie ? movie.Year : null;

            await reply(`🔍 *Searching for full movie: "${movieTitle}"...*\n_This may take a moment_`);

            const fullVideo = await findFullMovieVideo(movieTitle, movieYear);

            if (!fullVideo) {
                return reply(
                    `❌ *Full movie not found publicly on YouTube.*\n\n` +
                    `_Try:_ \`${prefix}movieinfo ${text}\` _to get movie details only._`
                );
            }

            // 4. Show what we found and confirm downloading
            const durationMin = Math.round(fullVideo.seconds / 60);
            await client.sendMessage(m.chat, {
                text:
                    `🎬 *Found Full Movie!*\n\n` +
                    `📽️ *${fullVideo.title}*\n` +
                    `⏱️ *Duration:* ${fullVideo.timestamp} (${durationMin} min)\n` +
                    `👁️ *Views:* ${(fullVideo.views || 0).toLocaleString()}\n\n` +
                    `⬇️ _Streaming at lowest quality (360p) for WhatsApp delivery..._\n` +
                    `_Large file — may take 2–5 minutes depending on movie length_`
            }, { quoted: m });

            // 5. Stream the full movie to disk via ytdl-core
            const safeTitle = (movieTitle || "movie").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
            tempFile = path.join(tmpDir, `movie_${Date.now()}_${safeTitle}.mp4`);

            try {
                await streamVideoToDisk(fullVideo.url, tempFile, "lowest");
            } catch (streamErr) {
                console.log("[Movie] ytdl stream failed, trying scraper:", streamErr.message);
                // Fallback: try vreden scraper at 360p
                const scrapRes = await scraper.ytmp4(fullVideo.url, "360");
                if (scrapRes?.download?.url) {
                    const r = await axios.get(scrapRes.download.url, {
                        responseType: "arraybuffer",
                        timeout: 120000,
                        maxContentLength: 200 * 1024 * 1024,
                        headers: { "User-Agent": "Mozilla/5.0" }
                    });
                    fs.writeFileSync(tempFile, Buffer.from(r.data));
                } else {
                    throw new Error("All download methods failed for this movie.");
                }
            }

            // 6. Check file size
            const stats = fs.statSync(tempFile);
            const sizeBytes = stats.size;
            const sizeMB = sizeBytes / (1024 * 1024);

            console.log(`[Movie] Downloaded: ${formatSize(sizeBytes)} for "${movieTitle}"`);

            // 7. Send as VIDEO if ≤80MB, otherwise send as DOCUMENT
            const filmCaption =
                `🎬 *${movieTitle}${movieYear ? ` (${movieYear})` : ""}*\n` +
                (movie ? `⭐ *IMDb:* ${movie.imdbRating}/10 • 🎭 ${movie.Genre}\n` : "") +
                `⏱️ *Duration:* ${fullVideo.timestamp}\n` +
                `📦 *File Size:* ${formatSize(sizeBytes)}\n\n` +
                `🐉 *Downloaded by RED DRAGON OFC*`;

            const fileData = fs.readFileSync(tempFile);

            if (sizeMB <= 80) {
                // Send as playable video message
                await client.sendMessage(m.chat, {
                    video: fileData,
                    caption: filmCaption,
                    mimetype: "video/mp4",
                    fileName: `${safeTitle}.mp4`
                }, { quoted: m });
            } else {
                // Send as document — no size limit for playback, user opens with phone player
                await client.sendMessage(m.chat, {
                    document: fileData,
                    mimetype: "video/mp4",
                    fileName: `${safeTitle}.mp4`,
                    caption: filmCaption + "\n\n_📂 Sent as file — tap to download & play with video player_"
                }, { quoted: m });
            }

            await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });

        } catch (error) {
            console.error("[Movie Plugin Error]:", error.message);
            reply(`❌ *Movie download failed:* ${error.message}\n\n_Try \`.movieinfo ${text}\` for movie details only._`);
        } finally {
            if (tempFile && fs.existsSync(tempFile)) {
                try { fs.unlinkSync(tempFile); } catch {}
            }
        }
    }
};
