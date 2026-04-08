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

// Deep history (up to 5000 bars on Grow). Used by backtester.
async function getDeepHistory(symbol, interval, outputsize = 1000) {
  const data = await apiCall('/time_series', {
    symbol,
    interval,
    outputsize,
    timezone: 'America/New_York',
  });
  return (data.values || [])
    .map((v) => ({
      datetime: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
    }))
    .reverse(); // oldest -> newest
}

async function getQuote(symbol) {
  return apiCall('/quote', { symbol });
}

async function getATR(symbol, interval = '1h', timePeriod = 14) {
  return apiCall('/atr', { symbol, interval, time_period: timePeriod, outputsize: 1 });
}

// Twelve Data Economic Calendar.
// Optional params: country (CSV), importance (1|2|3 = low/medium/high),
// start_date, end_date (ISO date strings).
async function getEconomicCalendar(params = {}) {
  return apiCall('/economic_calendar', params);
}

async function getPrice(symbol) {
  return apiCall('/price', { symbol });
}

async function fetchPairData(symbol) {
  // Fetch all timeframes needed: 4H, 1H, 30min, 15min + quote
  // Sequential to respect rate limits
  const data4H = await getTimeSeries(symbol, '4h', 100);
  const data1H = await getTimeSeries(symbol, '1h', 100);
  const data30 = await getTimeSeries(symbol, '30min', 100);
  const data15 = await getTimeSeries(symbol, '15min', 100);
  const quote = await getQuote(symbol);

  const parseCandles = (data) => (data.values || []).map(v => ({
    datetime: v.datetime,
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: parseFloat(v.volume || 0),
  })).reverse();

  const candles4H = parseCandles(data4H);
  const candles1H = parseCandles(data1H);
  const candles30m = parseCandles(data30);
  const candles15m = parseCandles(data15);

  const currentPrice = parseFloat(quote.close || quote.price);
  const previousClose = parseFloat(quote.previous_close || 0);
  const todayHigh = quote.high ? parseFloat(quote.high) : null;
  const todayLow = quote.low ? parseFloat(quote.low) : null;
  const todayOpen = quote.open ? parseFloat(quote.open) : null;

  return {
    todayHigh,
    todayLow,
    todayOpen,
    candles4H,
    candles1H,
    candles30m,
    candles15m,
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
  getQuote,
  getATR,
  getEconomicCalendar,
  getDeepHistory,
  getCacheStatus,
};
