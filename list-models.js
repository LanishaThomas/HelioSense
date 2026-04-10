require('dotenv').config();
const axios = require('axios');
const API_KEY = process.env.GEMINI_API_KEY;

async function run() {
  try {
    if (!API_KEY) {
      throw new Error('Missing GEMINI_API_KEY in environment');
    }

    const versions = ['v1', 'v1beta'];
    for (const version of versions) {
      try {
        const res = await axios.get(`https://generativelanguage.googleapis.com/${version}/models?key=${API_KEY}`);
        const names = (res.data.models || []).map(m => m.name);
        console.log(`\n${version} models:`);
        console.log(names);
      } catch (err) {
        console.error(`${version} list failed:`, err.response?.data || err.message);
      }
    }
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
}
run();
