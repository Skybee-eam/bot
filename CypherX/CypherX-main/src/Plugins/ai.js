const fetch = require('node-fetch');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { fromBuffer } = require('file-type');
const path = require('path');
const { handleMediaUpload } = require('../../lib/catbox');

module.exports = [
{
  command: ['analyze', 'imagetotext', 'analyse'],
  operate: async ({ m, Cypher, reply }) => {
    const quoted = m.quoted || m.msg?.quoted;
    const mime = quoted?.mimetype || quoted?.msg?.mimetype;

    if (!quoted || !mime || !mime.startsWith("image/")) {
      return reply('*Please reply to an image message!*');
    }

    try {
      const mediaUrl = await handleMediaUpload(quoted, Cypher, mime);

      const apiUrl = `${global.siputzx}/api/ai/image2text?url=${encodeURIComponent(mediaUrl)}`;
      const response = await axios.get(apiUrl);

      if (response.status === 200 && response.data.status) {
        reply(`*Image Analysis Result:*\n\n${response.data.data}`);
      } else {
      reply(global.mess.error);
      }
    } catch (error) {
      console.error('Error analyzing the image:', error);
      reply(global.mess.error);
    }
  }
},
 {
  command: ['blackbox'],
  operate: async ({ m, reply, text }) => {
    if (!text) return reply(global.mess.notext);

    try {
      let response = await fetch(`${global.siputzx}/api/ai/blackboxai?content=${encodeURIComponent(text)}`);
      let data = await response.json();

      if (response.status !== 200 || !data.status || !data.data) {
      reply(global.mess.error);
      } else {
        reply(data.data);
      }
    } catch (error) {
      console.error('Error fetching response from BlackboxAI API:', error);
      reply(global.mess.error);
    }
  }
},
{
  command: ['dalle'],
  operate: async ({ Cypher, m, reply, text }) => {
    if (!text) return reply(global.mess.notext);

    const apiUrl = `${global.siputzx}/api/ai/stable-diffusion?prompt=${encodeURIComponent(text)}`;
    try {
      await Cypher.sendMessage(m.chat, { image: { url: apiUrl } }, { quoted: m });
    } catch (error) {
      console.error('Error generating image:', error);
      reply(global.mess.error);
    }
  }
},
{
  command: ['gemini'],
  operate: async ({ m, reply, text }) => {
    if (!text) return reply(global.mess.notext);

    try {
      let response = await fetch(`https://bk9.fun/ai/gemini?q=${encodeURIComponent(text)}`);
      let data = await response.json();

      if (response.status !== 200 || !data.status || !data.BK9) {
      reply(global.mess.error);
      } else {
        reply(data.BK9);
      }
    } catch (error) {
      console.error('Error fetching response from Gemini AI API:', error);
      reply(global.mess.error);
    }
  }
},
 {
  command: ['generate'],
  operate: async ({ Cypher, m, reply, text, prefix, command }) => {
if (!text) return reply(global.mess.notext);

    const api3Url = `https://api.gurusensei.workers.dev/dream?prompt=${encodeURIComponent(text)}`;
    try {
      await Cypher.sendMessage(m.chat, { image: { url: api3Url } }, { quoted: m });
    } catch (error) {
      console.error('Error generating image:', error);
      reply(global.mess.error);
    }
  }
},
{
  command: ['dbrx'],
  operate: async ({ m, reply, text }) => {
    if (!text) return reply(global.mess.notext);

    try {
      const apiUrl = `${global.siputzx}/api/ai/dbrx-instruct?content=${encodeURIComponent(text)}`;
      const response = await fetch(apiUrl);
      const result = await response.json();

      if (!result.status || !result.data) {
      reply(global.mess.error);
      } else {
        reply(result.data);
      }
    } catch (error) {
      console.error('Error fetching response from DBRX API:', error);
      reply(global.mess.error);
    }
  }
},
{
  command: ['deepseek'],
  operate: async ({ m, reply, text }) => {
    if (!text) return reply(global.mess.notext);

    try {
      const apiUrl = `${global.siputzx}/api/ai/deepseek-r1?content=${encodeURIComponent(text)}`;
      const response = await fetch(apiUrl);
      const result = await response.json();

      if (!result.status || !result.data) {
      reply(global.mess.error);
      } else {
        reply(result.data);
      }
    } catch (error) {
      console.error('Error fetching response from DeepSeek-R1 API:', error);
      reply(global.mess.error);
    }
  }
},
{
  command: ['deepseekllm'],
  operate: async ({ m, reply, text }) => {
    if (!text) return reply(global.mess.notext);

    try {
      const apiUrl = `${global.siputzx}/api/ai/deepseek-llm-67b-chat?content=${encodeURIComponent(text)}`;
      const response = await fetch(apiUrl);
      const result = await response.json();

      if (!result.status || !result.data) {
      reply(global.mess.error);
      } else {
        reply(result.data);
      }
    } catch (error) {
      console.error('Error fetching response from DeepSeek-LLM API:', error);
      reply(global.mess.error);
    }
  }
},
{
  command: ['doppleai'],
  operate: async ({ reply, m, text }) => {
    async function fetchDoppleAIResponse(query) {
      const response = await axios.get(`${global.api}/doppleai?prompt=${encodeURIComponent(query)}`);
      return response.data;
    }

    try {
if (!text) return reply(global.mess.notext);
      const result = await fetchDoppleAIResponse(text);
      reply(result.response);
    } catch (error) {
      console.error('Error in DoppleAI plugin:', error);
      reply(global.mess.error);
    }
  }
},
{
  command: ['gpt'],
  operate: async ({ m, reply, text }) => {
    if (!text) return reply(global.mess.notext);

    try {
      const apiUrl = `${global.siputzx}/api/ai/gpt3?prompt=you%20are%20an%20helpful%20assistant%20providing%20detailed%20and%20friendly%20responses&content=${encodeURIComponent(text)}`;
      const response = await fetch(apiUrl);
      const result = await response.json();

      if (!result.status || !result.data) {
      reply(global.mess.error);
      } else {
        reply(result.data);
      }
    } catch (error) {
      console.error('Error fetching response from GPT API:', error);
      reply(global.mess.error);
    }
  }
},
{
  command: ['gpt2'],
  operate: async ({ m, reply, text }) => {
    if (!text) return reply(global.mess.notext);

    try {
      let response = await fetch(`https://bk9.fun/ai/jeeves-chat?q=${encodeURIComponent(text)}`);
      let data = await response.json();

      if (!data.BK9) {
      reply(global.mess.error);
      } else {
        reply(data.BK9);
      }
    } catch (error) {
      console.error('Error fetching response from GPT-2 API:', error);
      reply(global.mess.error);
    }
  }
},
 {
  command: ['imagen'],
  operate: async ({ Cypher, m, reply, text, prefix, command }) => {
if (!text) return reply(global.mess.notext);

    const api2Url = `https://bk9.fun/ai/magicstudio?prompt=${encodeURIComponent(text)}`;
    try {
      await Cypher.sendMessage(m.chat, { image: { url: api2Url } }, { quoted: m });
    } catch (error) {
      console.error('Error generating image:', error);
      reply(global.mess.error);
    }
  }
},
  {
  command: ['imagine'],
  operate: async ({ Cypher, m, reply, text, prefix, command }) => {
if (!text) return reply(global.mess.notext);

    const apiUrl = `${global.siputzx}/api/ai/flux?prompt=${encodeURIComponent(text)}`;
    try {
      await Cypher.sendMessage(m.chat, { image: { url: apiUrl } }, { quoted: m });
    } catch (error) {
      console.error('Error generating image:', error);
      reply(global.mess.error);
    }
  }
},
{
  command: ['letterai'],
  operate: async ({ m, reply, text }) => {
    if (!text) return reply(global.mess.notext);

    try {
      const apiUrl = `${global.siputzx}/api/ai/moshiai?input=${encodeURIComponent(text)}`;
      const response = await fetch(apiUrl);
      const result = await response.json();

      if (!result.status || !result.data) {
      reply(global.mess.error);
      } else {
        reply(result.data);
      }
    } catch (error) {
      console.error('Error fetching response from LetterAI API:', error);
       reply(global.mess.error);
    }
  }
},
  {
  command: ['llama'],
  operate: async ({ m, reply, text }) => {
    if (!text) return reply(global.mess.notext);

    try {
      let response = await fetch(`https://bk9.fun/ai/llama?q=${encodeURIComponent(text)}`);
      let data = await response.json();

      if (!data.BK9) {
      reply(global.mess.error);
      } else {
        reply(data.BK9);
      }
    } catch (error) {
      console.error('Error fetching response from Llama API:', error);
      reply(global.mess.error);
    }
  }
},
{
  command: ['metaai'],
  operate: async ({ m, reply, text }) => {
    if (!text) return reply(global.mess.notext);

    try {
      const apiUrl = `${global.siputzx}/api/ai/meta-llama-33-70B-instruct-turbo?content=${encodeURIComponent(text)}`;
      const response = await fetch(apiUrl);
      const result = await response.json();

      if (!result.status || !result.data) {
      reply(global.mess.error);
      } else {
        reply(result.data);
      }
    } catch (error) {
      console.error('Error fetching response from MetaAI API:', error);
      reply(global.mess.error);
    }
  }
},
{
  command: ['mistral'],
  operate: async ({ m, reply, text }) => {
    if (!text) return reply(global.mess.notext);

    try {
      const apiUrl = `${global.siputzx}/api/ai/mistral-7b-instruct-v0.2?content=${encodeURIComponent(text)}`;
      const response = await fetch(apiUrl);
      const result = await response.json();

      if (!result.status || !result.data) {
      reply(global.mess.error);
      } else {
        reply(result.data);
      }
    } catch (error) {
      console.error('Error fetching response from Mistral API:', error);
       reply(global.mess.error);
    }
  }
},
  {
  command: ['photoai'],
  operate: async ({ Cypher, m, reply, text, prefix, command }) => {
if (!text) return reply(global.mess.notext);

    const apiUrl = `${global.siputzx}/api/ai/dreamshaper?prompt=${encodeURIComponent(text)}`;
    try {
      await Cypher.sendMessage(m.chat, { image: { url: apiUrl } }, { quoted: m });
    } catch (error) {
      console.error('Error generating image:', error);
       reply(global.mess.error);
    }
  }
},
];