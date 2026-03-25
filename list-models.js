require('dotenv').config();
const axios = require('axios');
const API_KEY = process.env.GEMINI_API_KEY;
async function run() {
  try {
    if (!API_KEY) {
      throw new Error('Missing GEMINI_API_KEY in environment');
    }
    const res = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
    console.log(res.data.models.map(m => m.name));
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
}
run();
