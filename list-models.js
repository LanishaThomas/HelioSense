const axios = require('axios');
const API_KEY = 'AIzaSyAsKi5AElooNk4GyQOJ_VJQhPFl0dJppZo';
async function run() {
  try {
    const res = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
    console.log(res.data.models.map(m => m.name));
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
}
run();
