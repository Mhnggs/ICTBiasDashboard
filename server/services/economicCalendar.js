const { getEconomicCalendar } = require('./twelveData');

// Currencies relevant to the 6 forex pairs we trade
const RELEVANT_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD'];

// Map currencies to their event country codes (TD uses ISO country names)
// TD's economic_calendar uses country full name in `country` field.
function isRelevantCurrency(c) {
  return RELEVANT_CURRENCIES.includes((c || '').toUpperCase());
}

function normaliseImportance(raw) {
  // TD returns importance as number 0-3 or string. Normalise to 1..3
  const n = parseInt(raw, 10);
  if (!isNaN(n)) return Math.max(1, Math.min(3, n));
  if (typeof raw === 'string') {
    if (/high/i.test(raw)) return 3;
    if (/medium/i.test(raw)) return 2;
    if (/low/i.test(raw)) return 1;
  }
  return 1;
}

async function fetchCalendar({ hoursAhead = 48, minImportance = 2 } = {}) {
  const now = new Date();
  const end = new Date(now.getTime() + hoursAhead * 3600 * 1000);

  const startDate = now.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const raw = await getEconomicCalendar({
    start_date: startDate,
    end_date: endDate,
  });

  // TD response shape: { status, data: [...] } or values array — handle both.
  const events = raw?.data || raw?.values || raw || [];
  const list = Array.isArray(events) ? events : [];

  const out = list
    .map((e) => {
      const importance = normaliseImportance(e.importance);
      // Build datetime — TD provides `date` and `time` separately for some plans
      let dt = null;
      if (e.datetime) dt = new Date(e.datetime);
      else if (e.date && e.time) dt = new Date(`${e.date}T${e.time}Z`);
      else if (e.date) dt = new Date(e.date);
      return {
        title: e.event || e.title || e.indicator || 'Event',
        currency: (e.currency || e.currency_code || '').toUpperCase(),
        country: e.country,
        importance,
        actual: e.actual ?? null,
        forecast: e.forecast ?? null,
        previous: e.previous ?? null,
        datetime: dt ? dt.toISOString() : null,
        timestampMs: dt ? dt.getTime() : null,
      };
    })
    .filter((e) => e.timestampMs && e.timestampMs >= now.getTime() - 30 * 60 * 1000) // include events from 30min ago
    .filter((e) => e.timestampMs <= end.getTime())
    .filter((e) => isRelevantCurrency(e.currency))
    .filter((e) => e.importance >= minImportance)
    .sort((a, b) => a.timestampMs - b.timestampMs);

  return {
    fetchedAt: now.toISOString(),
    horizonHours: hoursAhead,
    events: out,
  };
}

module.exports = { fetchCalendar };
