const axios = require('axios');
const { sleep } = require('../utils/helpers');

const BASE_URL = 'https://api.twelvedata.com';
const API_KEY = process.env.TWELVE_DATA_API_KEY;

// In-memory cache: key -> { data, timestamp }
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(endpoint, params) {
  return `${endpoint}:${JSON.stringify(params)}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// Rate limit tracking
let lastCallTime = 0;
const MIN_CALL_INTERVAL = 1200; // ~1.2s between calls to stay under 8/min

async function apiCall(endpoint, params) {
  const cacheKey = getCacheKey(endpoint, params);
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // Rate limit
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < MIN_CALL_INTERVAL) {
    await sleep(MIN_CALL_INTERVAL - elapsed);
  }
  lastCallTime = Date.now();

  const url = `${BASE_URL}${endpoint}`;
  const response = await axios.get(url, {
    params: { ...params, apikey: API_KEY },
    timeout: 15000,
  });

  if (response.data.status === 'error') {
    const err = new Error(response.data.message || 'Twelve Data API error');
    err.code = response.data.code;
    throw err;
  }

  setCache(cacheKey, response.data);
  return response.data;
}

async function getTimeSeries(symbol, interval, outputsize) {
  return apiCall('/time_series', {
    symbol,
    interval,
    outputsize,
    timezone: 'America/New_York',
  });
}

async function getQuote(symbol) {
  return apiCall('/quote', { symbol });
}

async function getPrice(symbol) {
  return apiCall('/price', { symbol });
}

async function fetchPairData(symbol) {
  // Fetch all data needed for analysis: 4H, 1H candles + quote
  // Sequential to respect rate limits
  const data4H = await getTimeSeries(symbol, '4h', 30);
  const data1H = await getTimeSeries(symbol, '1h', 48);
  const quote = await getQuote(symbol);

  // Parse candles (API returns newest first, reverse to oldest first)
  const candles4H = (data4H.values || []).map(v => ({
    datetime: v.datetime,
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: parseFloat(v.volume || 0),
  })).reverse();

  const candles1H = (data1H.values || []).map(v => ({
    datetime: v.datetime,
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: parseFloat(v.volume || 0),
  })).reverse();

  const currentPrice = parseFloat(quote.close || quote.price);
  const previousClose = parseFloat(quote.previous_close || 0);

  return {
    candles4H,
    candles1H,
    currentPrice,
    previousClose,
    quote,
  };
}

function getCacheStatus() {
  let active = 0;
  const now = Date.now();
  for (const [, entry] of cache) {
    if (now - entry.timestamp < CACHE_TTL) active++;
  }
  return { entries: cache.size, active };
}

module.exports = {
  fetchPairData,
  getPrice,
  getCacheStatus,
};
