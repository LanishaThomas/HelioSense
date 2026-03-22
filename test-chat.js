const axios = require('axios');

async function test() {
  try {
    const res = await axios.post('http://localhost:3000/api/chat', {
      message: 'Hola',
      language: 'Español'
    });
    console.log('Response:', res.data);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
