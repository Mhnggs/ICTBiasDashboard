import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

function colorFor(avgPct) {
  if (avgPct > 0.05) return 'bg-bull';
  if (avgPct < -0.05) return 'bg-bear';
  return 'bg-warn';
}

export default function StrengthMeter({ liveSnapshot }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/strength');
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (liveSnapshot) setData(liveSnapshot);
  }, [liveSnapshot]);

  useEffect(() => {
    if (!liveSnapshot) load();
    const id = setInterval(() => {
      if (!liveSnapshot) load();
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  return (
    <div className="rounded-xl bg-bg-card border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
          Currency Strength
        </h3>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-[11px] text-text-muted">
              {data.pairsUsed}/{data.pairsTotal} pairs · {new Date(data.timestamp).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="text-xs px-2.5 py-1 rounded-md bg-bg-primary border border-border text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="text-bear text-xs mb-3">{error}</div>}

      {data && (
        <div className="space-y-2">
          {data.currencies.map((c) => {
            const width = Math.max(2, Math.min(100, c.score));
            const sign = c.avgPct >= 0 ? '+' : '';
            return (
              <div key={c.currency} className="flex items-center gap-3">
                <span className="font-mono text-xs text-text-primary w-10">{c.currency}</span>
                <div className="flex-1 h-5 bg-bg-primary rounded-md overflow-hidden border border-border">
                  <div
                    className={`h-full ${colorFor(c.avgPct)} transition-all duration-500`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <span className="font-mono text-[11px] text-text-secondary w-16 text-right">
                  {sign}{c.avgPct.toFixed(3)}%
                </span>
              </div>
            );
          })}
          <p className="text-[10px] text-text-muted mt-3">
            Strongest at top. Best setup: long the strongest vs short the weakest.
          </p>
        </div>
      )}
    </div>
  );
}
