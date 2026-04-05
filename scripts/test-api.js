require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.TWELVE_DATA_API_KEY;

async function test() {
  console.log('Testing Twelve Data API...');
  console.log(`API Key: ${API_KEY ? API_KEY.slice(0, 6) + '...' : 'NOT SET'}`);

  try {
    const res = await axios.get('https://api.twelvedata.com/price', {
      params: { symbol: 'EUR/USD', apikey: API_KEY },
    });
    console.log('EUR/USD Price:', res.data);
    console.log('API connection successful!');
  } catch (err) {
    console.error('API test failed:', err.message);
  }
}

test();
