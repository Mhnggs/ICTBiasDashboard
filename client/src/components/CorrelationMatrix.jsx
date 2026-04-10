import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

const INTERVALS = ['5min', '15min', '30min', '1h', '4h'];

// Map correlation [-1..1] to a background color string.
function corrColor(v) {
  if (v == null) return 'bg-bg-primary text-text-muted';
  if (v >= 0.8) return 'bg-bull/70 text-bg-primary';
  if (v >= 0.5) return 'bg-bull/40 text-text-primary';
  if (v >= 0.2) return 'bg-bull/15 text-text-secondary';
  if (v <= -0.8) return 'bg-bear/70 text-bg-primary';
  if (v <= -0.5) return 'bg-bear/40 text-text-primary';
  if (v <= -0.2) return 'bg-bear/15 text-text-secondary';
  return 'bg-bg-primary text-text-muted';
}

function shortPair(p) {
  return p.replace('/', '');
}

export default function CorrelationMatrix() {
  const [data, setData] = useState(null);
  const [interval, setInterval2] = useState('1h');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/correlation?interval=${interval}&lookback=50`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [interval]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <div className="rounded-xl bg-bg-card border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
          Correlation Matrix
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={interval}
            onChange={(e) => setInterval2(e.target.value)}
            className="bg-bg-primary border border-border rounded text-[11px] px-1.5 py-0.5 text-text-secondary"
          >
            {INTERVALS.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="text-xs px-2 py-0.5 rounded-md bg-bg-primary border border-border text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="text-bear text-xs mb-2">{error}</div>}

      {data && (
        <>
          <div className="overflow-x-auto">
            <table className="text-[10px] font-mono border-separate border-spacing-0.5">
              <thead>
                <tr>
                  <th></th>
                  {data.pairs.map((p) => (
                    <th key={p} className="text-text-muted font-medium px-1 pb-1">{shortPair(p)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.pairs.map((rowPair, ri) => (
                  <tr key={rowPair}>
                    <td className="text-text-muted font-medium pr-2 text-right">{shortPair(rowPair)}</td>
                    {data.pairs.map((colPair, ci) => {
                      const v = data.matrix[ri][ci];
                      return (
                        <td
                          key={colPair}
                          className={`w-9 h-7 text-center rounded ${corrColor(v)}`}
                          title={`${rowPair} vs ${colPair}: ${v == null ? 'n/a' : v.toFixed(2)}`}
                        >
                          {v == null ? '—' : v.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-text-muted mt-2">
            ≥ +0.8 = same trade. ≤ −0.8 = mirror trade. Avoid stacking correlated positions.
          </p>
        </>
      )}
    </div>
  );
}
