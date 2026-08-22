const axios = require('axios');
const yts = require('yt-search');
const scraper = require('@vreden/youtube_scraper');
const fs = require('fs');
const path = require('path');

const tmpDir = path.join(__dirname, "..", "tmp");
if (!fs.existsSync(tmpDir)) {
    try { fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
}

// OMDb API Key pool
const OMDB_KEYS = ['trilogy', '7a3f8a92', 'b8b387c9'];

async function fetchMovieInfo(title) {
    for (const key of OMDB_KEYS) {
        try {
            const res = await axios.get(`https://www.omdbapi.com/?apikey=${key}&t=${encodeURIComponent(title)}&plot=full`, {
                timeout: 8000
            });
            if (res.data && res.data.Response === 'True') {
                return res.data;
            }
        } catch {}
    }
    return null;
}

module.exports = {
    name: "movie",
    alias: ["film", "cinema", "imdb", "movieinfo", "moviedl"],
    category: "download",
    description: "Search, fetch details, and download playable movie clips/trailers",
    async execute(client, m, { text, prefix, command, reply }) {
        let tempFile = null;

        try {
            if (!text) {
                return reply(
                    `🎬 *RED DRAGON MOVIE & CINEMA HUB*\n\n` +
                    `*Usage Examples:*\n` +
                    `• *${prefix}movie Inception* ➔ Get movie details & watchable trailer\n` +
                    `• *${prefix}movieinfo Avatar* ➔ Get full movie synopsis & cast\n` +
                    `• *${prefix}moviedl Spider-Man* ➔ Download movie highlight stream\n\n` +
                    `_Please provide a movie title to search!_`
                );
            }

            await client.sendMessage(m.chat, { react: { text: "🎬", key: m.key } });

            const isInfoOnly = command === 'movieinfo' || command === 'imdb';

            // 1. Fetch Movie Data from OMDb / IMDb
            const movie = await fetchMovieInfo(text);

            let movieCaption = "";
            let posterUrl = "";

            if (movie) {
                posterUrl = movie.Poster && movie.Poster !== 'N/A' ? movie.Poster : '';
                movieCaption =
`🎬 *${movie.Title.toUpperCase()} (${movie.Year})*
⭐ *IMDb Rating:* ${movie.imdbRating}/10 (${movie.imdbVotes} votes)
🎭 *Genre:* ${movie.Genre}
⏱️ *Runtime:* ${movie.Runtime}
📅 *Released:* ${movie.Released}
👤 *Director:* ${movie.Director}
👥 *Cast:* ${movie.Actors}
🏆 *Awards:* ${movie.Awards || 'N/A'}
🌍 *Language/Country:* ${movie.Language} | ${movie.Country}

📖 *SYNOPSIS:*
_${movie.Plot || 'No plot summary available.'}_

🐉 *RED DRAGON CINEMA STUDIO*`;
            }

            // If info-only requested, send poster + details
            if (isInfoOnly) {
                if (!movie) {
                    return reply(`❌ *Movie "${text}" not found in database.*`);
                }

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

            // 2. Search for Movie Trailer / Clip on YouTube
            const searchQuery = movie ? `${movie.Title} ${movie.Year} official trailer` : `${text} movie trailer`;
            
            const searchResult = await yts(searchQuery);
            const video = searchResult.videos && searchResult.videos[0];

            if (!video) {
                if (movie) {
                    if (posterUrl) {
                        await client.sendMessage(m.chat, { image: { url: posterUrl }, caption: movieCaption }, { quoted: m });
                    } else {
                        await reply(movieCaption);
                    }
                    return;
                }
                return reply(`❌ *No movie videos found for "${text}".*`);
            }

            // Extract video stream URL
            let streamUrl = null;
            try {
                const scrapRes = await scraper.ytmp4(video.url, '360');
                if (scrapRes?.status && scrapRes?.download?.url) {
                    streamUrl = scrapRes.download.url;
                }
            } catch (err) {
                console.error('[Movie Scraper Error]:', err.message);
            }

            // Fallback video APIs if scraper failed
            if (!streamUrl) {
                const fallbacks = [
                    `https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(video.url)}`,
                    `https://api.agatz.xyz/api/ytmp4?url=${encodeURIComponent(video.url)}`
                ];
                for (const fb of fallbacks) {
                    try {
                        const r = await axios.get(fb, { timeout: 12000 });
                        streamUrl = r.data?.data?.dl || r.data?.result?.download?.url || r.data?.data?.download?.url;
                        if (streamUrl) break;
                    } catch {}
                }
            }

            if (!streamUrl) {
                const fallbackText = (movieCaption ? movieCaption + "\n\n" : "") +
                    `▶️ *Watch Link:* ${video.url}\n` +
                    `⚠️ _Video stream could not be converted to MP4 buffer directly._`;
                
                if (posterUrl) {
                    await client.sendMessage(m.chat, { image: { url: posterUrl }, caption: fallbackText }, { quoted: m });
                } else {
                    await reply(fallbackText);
                }
                return;
            }

            // Download MP4 binary stream
            const videoBufferRes = await axios.get(streamUrl, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 60000,
                maxContentLength: 80 * 1024 * 1024
            });

            const buffer = Buffer.from(videoBufferRes.data);

            // Write to temp file on disk to guarantee complete MP4 headers for WhatsApp player
            const safeTitle = ((movie ? movie.Title : video.title) || 'movie').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
            tempFile = path.join(tmpDir, `movie_${Date.now()}_${safeTitle}.mp4`);
            fs.writeFileSync(tempFile, buffer);

            const finalCaption = movie 
                ? `🎬 *${movie.Title} (${movie.Year})*\n⭐ *IMDb:* ${movie.imdbRating}/10 • 🎭 *Genre:* ${movie.Genre}\n⏱️ *Duration:* ${video.timestamp}\n\n_${(movie.Plot || '').slice(0, 200)}..._\n\n🐉 *Downloaded by RED DRAGON OFC*`
                : `🎬 *${video.title}*\n⏱️ *Duration:* ${video.timestamp} | 👁️ *Views:* ${video.views}\n\n🐉 *Downloaded by RED DRAGON OFC*`;

            // Send MP4 video from disk
            await client.sendMessage(m.chat, {
                video: fs.readFileSync(tempFile),
                caption: finalCaption,
                mimetype: "video/mp4",
                fileName: `${safeTitle}.mp4`
            }, { quoted: m });

            await client.sendMessage(m.chat, { react: { text: "✅", key: m.key } });

        } catch (error) {
            console.error('[Movie Plugin Error]:', error);
            reply(`❌ *Movie Engine Error:* ${error.message}`);
        } finally {
            if (tempFile && fs.existsSync(tempFile)) {
                try { fs.unlinkSync(tempFile); } catch {}
            }
        }
    }
};
