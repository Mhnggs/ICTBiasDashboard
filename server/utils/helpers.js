const PIP_VALUES = {
  'EUR/USD': 0.0001,
  'GBP/USD': 0.0001,
  'USD/JPY': 0.01,
  'GBP/JPY': 0.01,
  'AUD/USD': 0.0001,
  'NZD/USD': 0.0001,
};

const SUPPORTED_PAIRS = Object.keys(PIP_VALUES);

function getPipValue(pair) {
  return PIP_VALUES[pair] || 0.0001;
}

function priceToPips(priceDistance, pair) {
  return Math.round(priceDistance / getPipValue(pair));
}

function pipToPrice(pips, pair) {
  return pips * getPipValue(pair);
}

function formatPrice(price, pair) {
  const decimals = getPipValue(pair) === 0.01 ? 3 : 5;
  return Number(price).toFixed(decimals);
}

function percentDiff(a, b) {
  return Math.abs((a - b) / ((a + b) / 2)) * 100;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  PIP_VALUES,
  SUPPORTED_PAIRS,
  getPipValue,
  priceToPips,
  pipToPrice,
  formatPrice,
  percentDiff,
  sleep,
};
