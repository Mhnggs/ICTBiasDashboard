import axios from 'axios';

// DXY is derived from the currency strength meter's USD row — no extra API call.
// Twelve Data doesn't carry DXY cleanly on Grow, and since we already compute
// real-time USD strength from the 28-pair matrix, use that directly.
export default function DxyBadge({ pair, strength }) {
  const usd = strength?.currencies?.find((c) => c.currency === 'USD');

  if (!usd) {
    return (
      <div className="rounded-xl bg-bg-card border border-border p-4 flex items-center justify-center min-h-[88px]">
        <span className="text-[11px] text-text-muted">USD strength loading…</span>
      </div>
    );
  }

  const pct = usd.avgPct;
  const up = pct > 0.05;
  const down = pct < -0.05;
  const color = up ? 'text-bull' : down ? 'text-bear' : 'text-warn';
  const arrow = up ? '▲' : down ? '▼' : '◆';
  const sign = pct >= 0 ? '+' : '';

  // Confluence hint for the selected USD pair
  let hint = null;
  if (pair && (pair.startsWith('USD/') || pair.endsWith('/USD'))) {
    const usdIsBase = pair.startsWith('USD/');
    if (up) {
      hint = usdIsBase ? `Favors ${pair} LONG` : `Favors ${pair} SHORT`;
    } else if (down) {
      hint = usdIsBase ? `Favors ${pair} SHORT` : `Favors ${pair} LONG`;
    }
  }

  // Find USD's rank in the strength list (1 = strongest of 8)
  const rank = (strength?.currencies || []).findIndex((c) => c.currency === 'USD') + 1;

  return (
    <div className="rounded-xl bg-bg-card border border-border p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
          USD Strength
        </span>
        <span className={`text-xs font-mono ${color}`}>{arrow}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className={`font-mono text-xl ${color}`}>
          {sign}{pct.toFixed(3)}%
        </span>
        <span className="font-mono text-[11px] text-text-muted">
          rank {rank}/8
        </span>
      </div>
      {hint && (
        <div className={`mt-2 text-[10px] font-semibold uppercase tracking-wider ${color}`}>
          {hint}
        </div>
      )}
    </div>
  );
}
