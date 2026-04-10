// Economic calendar via ForexFactory's free weekly JSON feed.
// Twelve Data doesn't expose an economic calendar endpoint, and FF's feed is
// the de-facto industry standard: no auth, refreshed nightly, includes all
// major events with impact levels. Docs/source: https://www.forexfactory.com

const axios = require('axios');

const FF_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const FF_NEXT_URL = 'https://nfs.faireconomy.media/ff_calendar_nextweek.json';

const RELEVANT_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD'];

// FF feed fields: title, country (3-letter currency code), date (ISO),
// impact ('High'|'Medium'|'Low'|'Holiday'|'Non-Economic'),
// forecast, previous, url.
function mapImpact(impact) {
  if (!impact) return 0;
  const s = String(impact).toLowerCase();
  if (s.startsWith('high')) return 3;
  if (s.startsWith('medium')) return 2;
  if (s.startsWith('low')) return 1;
  return 0; // Holiday / Non-Economic
}

// Simple in-memory cache to avoid hammering FF on every poll
let cache = null;
let cacheAt = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 min

async function fetchFFJson(url) {
  const res = await axios.get(url, { timeout: 15000 });
  return Array.isArray(res.data) ? res.data : [];
}

async function fetchCalendar({ hoursAhead = 48, minImportance = 2 } = {}) {
  const now = Date.now();
  let rawEvents;
  if (cache && now - cacheAt < CACHE_TTL) {
    rawEvents = cache;
  } else {
    const [thisWeek, nextWeek] = await Promise.all([
      fetchFFJson(FF_URL).catch(() => []),
      fetchFFJson(FF_NEXT_URL).catch(() => []),
    ]);
    rawEvents = [...thisWeek, ...nextWeek];
    cache = rawEvents;
    cacheAt = now;
  }

  const horizonMs = hoursAhead * 3600 * 1000;
  const windowStart = now - 30 * 60 * 1000; // include events from 30m ago
  const windowEnd = now + horizonMs;

  const events = rawEvents
    .map((e) => {
      const dt = e.date ? new Date(e.date).getTime() : null;
      return {
        title: e.title || 'Event',
        currency: (e.country || e.currency || '').toUpperCase(),
        country: e.country,
        importance: mapImpact(e.impact),
        actual: e.actual ?? null,
        forecast: e.forecast ?? null,
        previous: e.previous ?? null,
        datetime: dt ? new Date(dt).toISOString() : null,
        timestampMs: dt,
      };
    })
    .filter((e) => e.timestampMs != null)
    .filter((e) => e.timestampMs >= windowStart && e.timestampMs <= windowEnd)
    .filter((e) => RELEVANT_CURRENCIES.includes(e.currency))
    .filter((e) => e.importance >= minImportance)
    .sort((a, b) => a.timestampMs - b.timestampMs);

  return {
    fetchedAt: new Date().toISOString(),
    horizonHours: hoursAhead,
    source: 'forexfactory',
    events,
  };
}

module.exports = { fetchCalendar };
