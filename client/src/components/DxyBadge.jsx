import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

export default function DxyBadge({ pair }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await axios.get('/api/dxy');
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60 * 1000); // refresh every minute
    return () => clearInterval(id);
  }, [load]);

  if (error || !data) {
    return (
      <div className="rounded-xl bg-bg-card border border-border p-4 flex items-center justify-center min-h-[88px]">
        <span className="text-[11px] text-text-muted">{error ? `DXY: ${error}` : 'Loading DXY…'}</span>
      </div>
    );
  }

  const up = data.direction === 'up';
  const down = data.direction === 'down';
  const color = up ? 'text-bull' : down ? 'text-bear' : 'text-warn';
  const arrow = up ? '▲' : down ? '▼' : '◆';
  const sign = data.change >= 0 ? '+' : '';

  // Confluence hint: which side of USD pairs DXY favors
  let hint = null;
  if (pair && (pair.startsWith('USD/') || pair.endsWith('/USD'))) {
    const usdIsBase = pair.startsWith('USD/');
    if (up) {
      hint = usdIsBase ? `Favors ${pair} LONG` : `Favors ${pair} SHORT`;
    } else if (down) {
      hint = usdIsBase ? `Favors ${pair} SHORT` : `Favors ${pair} LONG`;
    }
  }

  return (
    <div className="rounded-xl bg-bg-card border border-border p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
          DXY · Dollar Index
        </span>
        <span className={`text-xs font-mono ${color}`}>{arrow}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xl text-text-primary">{data.price?.toFixed(3)}</span>
        <span className={`font-mono text-xs ${color}`}>
          {sign}{data.change?.toFixed(3)} ({sign}{data.pct?.toFixed(2)}%)
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
