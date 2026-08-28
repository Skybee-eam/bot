const fetch = require('node-fetch');
const axios = require('axios');
const fs = require('fs');
const moment = require('moment-timezone');
const yts = require('yt-search');

module.exports = [
  {
    command: ['define'],
    operate: async ({ Cypher, m, reply, text }) => {
      if (!text) return reply("Enter a word to define.");
      
      try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${text}`);
        const json = await response.json();
        if (!json.length) throw new Error();

        const definitions = json[0].meanings[0].definitions
          .map((def, i) => `*Definition ${i + 1}:* ${def.definition}`)
          .join("\n\n");

        Cypher.sendMessage(m.chat, { text: `📖 *Definitions for:* ${text}\n\n${definitions}` }, { quoted: m });
      } catch (error) {
        reply(`❌ No definition found for *${text}*`);
      }
    }
  },
  {
    command: ['define2'],
    operate: async ({ m, text, Cypher, reply }) => {
      if (!text) return reply("What do you want to define?");
      
      try {
        const { data } = await axios.get(`http://api.urbandictionary.com/v0/define?term=${text}`);
        if (!data.list.length) throw new Error();

        const definition = data.list[0].definition.replace(/|/g, "");
        const example = data.list[0].example.replace(/|/g, "");
        
        Cypher.sendMessage(m.chat, { text: `📖 *Urban Definition of:* ${text}\n\n*Definition:* ${definition}\n\n*Example:* ${example}` }, { quoted: m });
      } catch (error) {
        reply(`❌ No definition found for *${text}*`);
      }
    }
  },
  {
    command: ['imdb', 'movie'],
    operate: async ({ Cypher, m, reply, text }) => {
      if (!text) return reply("Provide a movie or series name.");
      
      try {
        const { data } = await axios.get(`http://www.omdbapi.com/?apikey=742b2d09&t=${text}&plot=full`);
        if (data.Response === "False") throw new Error();

        const imdbText = `🎬 *IMDB SEARCH*\n\n`
          + `*Title:* ${data.Title}\n*Year:* ${data.Year}\n*Rated:* ${data.Rated}\n`
          + `*Released:* ${data.Released}\n*Runtime:* ${data.Runtime}\n*Genre:* ${data.Genre}\n`
          + `*Director:* ${data.Director}\n*Actors:* ${data.Actors}\n*Plot:* ${data.Plot}\n`
          + `*IMDB Rating:* ${data.imdbRating} ⭐\n*Votes:* ${data.imdbVotes}`;

        Cypher.sendMessage(m.chat, { image: { url: data.Poster }, caption: imdbText }, { quoted: m });
      } catch (error) {
        reply("❌ Unable to fetch IMDb data.");
      }
    }
  },
{
  command: ['lyrics', 'songlyrics'],
  operate: async ({ reply, args }) => {
    if (!args[0]) return reply("Please provide a song title\nExample: *.lyrics faded*");

    try {
      const { data } = await axios.get(`https://api.dreaded.site/api/lyrics?title=${encodeURIComponent(args.join(' '))}`);
      
      if (!data.success || !data.result.lyrics) {
        return reply("❌ Lyrics not found for this song.");
      }

      const { title, artist, lyrics, thumb, link } = data.result;
      const cleanLyrics = lyrics.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');

      reply(
        `*🎵 ${title}* - ${artist}\n\n` +
        `${cleanLyrics}\n\n` +
        (thumb ? `🎤 *Artwork:* (${thumb})\n` : '') +
        (link ? `🔗 *Listen on Deezer:* (${link})` : '')
      );

    } catch (error) {
      console.error(error);
      reply("❌ Failed to fetch lyrics. Please try again later.");
    }
  }
},
  {
    command: ['shazam', 'find', 'whatmusic'],
    operate: async ({ m, acr, reply }) => {
 const quoted = m.quoted ? m.quoted : null || m.msg ;
 const mime = quoted?.mimetype || ""; 
      if (!quoted || !/audio|video/.test(mime)) return reply("Reply to an audio or video to identify music.");
      
      try {
        const media = await m.quoted.download();
        const filePath = `./tmp/${m.sender}.${mime.split('/')[1]}`;
        fs.writeFileSync(filePath, media);

        const res = await acr.identify(fs.readFileSync(filePath));
        if (res.status.code !== 0) throw new Error(res.status.msg);

        const { title, artists, album, release_date } = res.metadata.music[0];
        const resultText = `🎵 *Music Identified!*\n\n*Title:* ${title}\n*Artist(s):* ${artists.map(v => v.name).join(', ')}\n`
          + `*Album:* ${album.name || 'Unknown'}\n*Release Date:* ${release_date || 'Unknown'}`;

        fs.unlinkSync(filePath);
        reply(resultText);
      } catch (error) {
        reply("❌ Unable to identify the music.");
      }
    }
  },
  {
    command: ['weather'],
    operate: async ({ Cypher, m, reply, text }) => {
      if (!text) return reply("Provide a location.");

      try {
        const { data } = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${text}&units=metric&appid=060a6bcfa19809c2cd4d97a212b19273`);
        
        const weatherInfo = `🌤️ *Weather for ${text}*\n\n`
          + `🌡️ *Temperature:* ${data.main.temp}°C (Feels like ${data.main.feels_like}°C)\n`
          + `🌪️ *Weather:* ${data.weather[0].main} - ${data.weather[0].description}\n`
          + `💨 *Wind Speed:* ${data.wind.speed} m/s\n`
          + `📍 *Coordinates:* ${data.coord.lat}, ${data.coord.lon}\n`
          + `🌍 *Country:* ${data.sys.country}`;

        Cypher.sendMessage(m.chat, { text: weatherInfo }, { quoted: m });
      } catch (error) {
        reply("❌ Unable to fetch weather data.");
      }
    }
  },
  {
    command: ['yts', 'ytsearch'],
    operate: async ({ Cypher, m, reply, text, prefix, command }) => {
      if (!text) return reply(`📌 *Example: ${prefix + command} Eminem Godzilla*`);

      try {
        const searchResults = await yts(text);
        if (!searchResults.all.length) return reply("❌ *No YouTube results found.*");

        let responseText = `🎥 *YouTube Search Results for:* ${text}\n\n`;
        searchResults.all.slice(0, 10).forEach((video, index) => {
          responseText += `□ *${index + 1}.* ${video.title}\n□ *Uploaded:* ${video.ago}\n□ *Views:* ${video.views}\n□ *Duration:* ${video.timestamp}\n□ *URL:* ${video.url}\n\n─────────────────\n\n`;
        });

        await Cypher.sendMessage(
          m.chat,
          { image: { url: searchResults.all[0].thumbnail }, caption: responseText },
          { quoted: m }
        );
      } catch (error) {
        console.error("YT Search command failed:", error);
        reply("❌ *An error occurred while fetching YouTube search results.*");
      }
    }
  }
];