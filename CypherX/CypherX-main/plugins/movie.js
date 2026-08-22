const axios = require("axios");
const yts = require("yt-search");
const ytdl = require("@distube/ytdl-core");
const scraper = require("@vreden/youtube_scraper");
const fs = require("fs");
const path = require("path");
const { convertVideoToMP4, tmpDir } = require("../src/Core/mediaConverter");

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

/**
 * Stream a YouTube video to disk using ytdl-core (best quality for full movies).
 * Returns the output file path.
 */
async function streamVideoToDisk(videoUrl, filePath) {
    return new Promise((resolve, reject) => {
        // Use lowest quality to keep file manageable for WhatsApp
        const stream = ytdl(videoUrl, {
            filter: format =>
                format.container === "mp4" &&
                format.hasVideo &&
                format.hasAudio &&
                (format.qualityLabel === "360p" || format.qualityLabel === "240p"),
            requestOptions: {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
            }
        });

        let gotData = false;
        const fileStream = fs.createWriteStream(filePath);

        stream.on("data", () => { gotData = true; });
        stream.pipe(fileStream);
        fileStream.on("finish", () => resolve(filePath));

        stream.on("error", (err) => {
            // If filtered stream has no formats, try without filter
            if (!gotData) {
                const fallbackStream = ytdl(videoUrl, {
                    filter: "videoandaudio",
                    quality: "lowest",
                    requestOptions: {
                        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
                    }
                });
                const fallbackFile = fs.createWriteStream(filePath);
                fallbackStream.pipe(fallbackFile);
                fallbackFile.on("finish", () => resolve(filePath));
                fallbackStream.on("error", reject);
            } else {
                reject(err);
            }
        });

        fileStream.on("error", reject);
        setTimeout(() => reject(new Error("Download timeout")), 12 * 60 * 1000);
    });
}

/**
 * Search YouTube for a FULL movie (>45 min duration).
 */
async function findFullMovieVideo(movieTitle, year) {
    const queries = [
        `"${movieTitle}" ${year || ""} full movie free`,
        `${movieTitle} full movie english`,
        `${movieTitle} complete film free`
    ];

    for (const query of queries) {
        try {
            const result = await yts(query);
            if (!result.videos?.length) continue;
            // Must be >45 minutes
            const candidates = result.videos
                .filter(v => v.seconds > 2700)
                .sort((a, b) => (b.views || 0) - (a.views || 0));
            if (candidates.length) return candidates[0];
        } catch {}
    }
    return null;
}

function formatSize(bytes) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

module.exports = {
    name: "movie",
    alias: ["film", "cinema", "imdb", "movieinfo", "moviedl"],
    category: "download",
    description: "Download full movies (iOS + Android compatible) or get movie info",
    async execute(client, m, { text, prefix, command, reply }) {
        const tempFiles = [];

        try {
            if (!text) {
                return reply(
                    `🎬 *RED DRAGON CINEMA HUB*\n\n` +
                    `• *${prefix}movie <title>* — Download FULL movie\n` +
                    `• *${prefix}movieinfo <title>* — Movie details & IMDb info\n\n` +
                    `Example: \`${prefix}movie Inception\``
                );
            }

            await client.sendMessage(m.chat, { react: { text: "🎬", key: m.key } });

            const isInfoOnly = command === "movieinfo" || command === "imdb";

            // ── 1. Fetch OMDb movie info ─────────────────────────────
            const movie = await fetchMovieInfo(text);
            let movieCaption = "";
            let posterUrl = "";

            if (movie) {
                posterUrl = movie.Poster !== "N/A" ? movie.Poster : "";
                const rtRating = movie.Ratings?.find(r => r.Source === "Rotten Tomatoes")?.Value || "N/A";
                movieCaption =
`🎬 *${movie.Title.toUpperCase()} (${movie.Year})*

⭐ *IMDb:* ${movie.imdbRating}/10  |  🍅 *RT:* ${rtRating}
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

            // ── Info-only mode ───────────────────────────────────────
            if (isInfoOnly) {
                if (!movie) return reply(`❌ *Movie "${text}" not found in database.*`);
                if (posterUrl) {
                    await client.sendMessage(m.chat, { image: { url: posterUrl }, caption: movieCaption }, { quoted: m });
                } else {
                    await reply(movieCaption);
                }
                await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
                return;
            }

            // ── 2. Show movie info card first ─────────────────────────
            if (movie) {
                const infoText = movieCaption + "\n\n_🔍 Searching for full movie..._";
                if (posterUrl) {
                    await client.sendMessage(m.chat, { image: { url: posterUrl }, caption: infoText }, { quoted: m });
                } else {
                    await reply(infoText);
                }
            }

            await client.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

            const movieTitle = movie?.Title || text;
            const movieYear = movie?.Year || null;

            // ── 3. Find full movie on YouTube ─────────────────────────
            const fullVideo = await findFullMovieVideo(movieTitle, movieYear);

            if (!fullVideo) {
                return reply(
                    `❌ *No public full-length movie found for "${movieTitle}" on YouTube.*\n\n` +
                    `_Try: \`${prefix}movieinfo ${text}\` for movie details._`
                );
            }

            const durationMin = Math.round(fullVideo.seconds / 60);
            await client.sendMessage(m.chat, {
                text:
                    `🎬 *Found:* ${fullVideo.title}\n` +
                    `⏱️ *Duration:* ${fullVideo.timestamp} (${durationMin} min)\n` +
                    `👁️ *Views:* ${(fullVideo.views || 0).toLocaleString()}\n\n` +
                    `⬇️ _Downloading & converting to H.264/AAC (iOS + Android compatible)..._\n` +
                    `_This may take 3–8 minutes for a full movie — please wait_`
            }, { quoted: m });

            // ── 4. Download raw video to disk ─────────────────────────
            const safeTitle = (movieTitle || "movie").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
            const rawPath = path.join(tmpDir, `movie_raw_${Date.now()}_${safeTitle}.mp4`);
            tempFiles.push(rawPath);

            try {
                await streamVideoToDisk(fullVideo.url, rawPath);
            } catch (streamErr) {
                console.log("[Movie] ytdl failed, trying scraper:", streamErr.message);
                // Fallback: vreden scraper
                const scrapRes = await scraper.ytmp4(fullVideo.url, "360");
                if (scrapRes?.download?.url) {
                    const r = await axios.get(scrapRes.download.url, {
                        responseType: "arraybuffer",
                        timeout: 120000,
                        maxContentLength: 500 * 1024 * 1024,
                        headers: { "User-Agent": "Mozilla/5.0" }
                    });
                    fs.writeFileSync(rawPath, Buffer.from(r.data));
                } else {
                    throw new Error("All download methods exhausted for this movie.");
                }
            }

            const rawSize = fs.statSync(rawPath).size;
            console.log(`[Movie] Raw download: ${formatSize(rawSize)} for "${movieTitle}"`);

            // ── 5. Convert to H.264 + AAC in MP4 (WhatsApp compatible) ─
            await client.sendMessage(m.chat, {
                text: `🔄 _Converting to iOS/Android compatible format (H.264 + AAC)..._\n_Size: ${formatSize(rawSize)} — almost done!_`
            }, { quoted: m });

            let finalPath = rawPath;
            try {
                // Scale to 480p, CRF 28, veryfast preset — good quality, smaller file
                finalPath = await convertVideoToMP4(rawPath, { crf: "28", preset: "veryfast", scale: "480:-2" });
                tempFiles.push(finalPath);
            } catch (convErr) {
                console.log("[Movie] ffmpeg convert failed, sending raw:", convErr.message);
                finalPath = rawPath; // send as-is
            }

            const finalSize = fs.statSync(finalPath).size;
            const finalSizeMB = finalSize / (1024 * 1024);
            console.log(`[Movie] Final size: ${formatSize(finalSize)} for "${movieTitle}"`);

            const filmCaption =
                `🎬 *${movieTitle}${movieYear ? ` (${movieYear})` : ""}*\n` +
                (movie ? `⭐ *IMDb:* ${movie.imdbRating}/10 • 🎭 ${movie.Genre}\n` : "") +
                `⏱️ *Duration:* ${fullVideo.timestamp} (${durationMin} min)\n` +
                `📦 *Size:* ${formatSize(finalSize)}\n\n` +
                `🐉 *RED DRAGON OFC — H.264/AAC*`;

            const fileData = fs.readFileSync(finalPath);

            if (finalSizeMB <= 90) {
                // ≤90 MB → send as inline playable video
                await client.sendMessage(m.chat, {
                    video: fileData,
                    caption: filmCaption,
                    mimetype: "video/mp4",
                    fileName: `${safeTitle}.mp4`
                }, { quoted: m });
            } else {
                // >90 MB → send as document (user taps to play with phone's video player)
                await client.sendMessage(m.chat, {
                    document: fileData,
                    mimetype: "video/mp4",
                    fileName: `${safeTitle}.mp4`,
                    caption: filmCaption + "\n\n📂 _Tap to download → open with Video Player_"
                }, { quoted: m });
            }

            await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });

        } catch (error) {
            console.error("[Movie Plugin Error]:", error.message);
            reply(`❌ *Movie failed:* ${error.message}\n\nTry \`.movieinfo ${text}\` for movie details.`);
        } finally {
            for (const f of tempFiles) {
                try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
            }
        }
    }
};
