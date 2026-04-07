import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

const TF_ORDER = ['4H', '1H', '30m', '15m'];

function biasClasses(bias) {
  if (bias === 'BULLISH') return 'bg-bull/20 text-bull border-bull/40';
  if (bias === 'BEARISH') return 'bg-bear/20 text-bear border-bear/40';
  return 'bg-warn/10 text-warn border-warn/30';
}

function strengthBadge(strength) {
  if (strength === 'STRONGEST') return 'bg-accent text-bg-primary';
  if (strength === 'STRONG') return 'bg-accent/70 text-bg-primary';
  if (strength === 'MODERATE') return 'bg-accent/40 text-text-primary';
  if (strength === 'WEAK') return 'bg-bg-primary text-text-muted border border-border';
  return 'bg-bg-primary text-text-muted border border-border';
}

export default function ScannerHeatmap({ onSelectPair }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/scanner');
      setRows(res.data.results || []);
      setUpdatedAt(new Date(res.data.timestamp));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="rounded-xl bg-bg-card border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
          Multi-Pair Scanner
        </h3>
        <div className="flex items-center gap-3">
          {updatedAt && (
            <span className="text-[11px] text-text-muted">
              Updated {updatedAt.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="text-xs px-2.5 py-1 rounded-md bg-bg-primary border border-border text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            {loading ? 'Scanning…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-bear text-xs mb-3">{error}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate border-spacing-y-1">
          <thead>
            <tr className="text-text-muted">
              <th className="text-left font-medium px-2">Pair</th>
              {TF_ORDER.map(tf => (
                <th key={tf} className="font-medium px-2">{tf}</th>
              ))}
              <th className="font-medium px-2">Overall</th>
              <th className="font-medium px-2">Asia Sweep</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              if (r.error) {
                return (
                  <tr key={r.pair}>
                    <td className="px-2 font-mono text-text-primary">{r.pair}</td>
                    <td colSpan={6} className="px-2 text-bear">{r.error}</td>
                  </tr>
                );
              }
              const tfMap = Object.fromEntries((r.timeframes || []).map(t => [t.label, t]));
              const sweepText = !r.asian?.complete
                ? 'forming'
                : r.bias === 'BEARISH'
                  ? (r.asian.highSwept ? 'HIGH SWEPT ✓' : 'wait high')
                  : r.bias === 'BULLISH'
                    ? (r.asian.lowSwept ? 'LOW SWEPT ✓' : 'wait low')
                    : '—';
              const sweepClass = !r.asian?.complete
                ? 'text-text-muted'
                : (r.bias === 'BEARISH' && r.asian.highSwept) ||
                  (r.bias === 'BULLISH' && r.asian.lowSwept)
                  ? 'text-bull font-semibold'
                  : 'text-text-muted';

              return (
                <tr
                  key={r.pair}
                  onClick={() => onSelectPair?.(r.pair)}
                  className="cursor-pointer hover:bg-bg-primary/40 transition-colors"
                >
                  <td className="px-2 py-1.5 font-mono text-text-primary font-semibold whitespace-nowrap">
                    {r.pair}
                  </td>
                  {TF_ORDER.map(tf => {
                    const cell = tfMap[tf];
                    if (!cell) {
                      return <td key={tf} className="px-2"><div className="h-7 rounded-md border border-border bg-bg-primary/40" /></td>;
                    }
                    return (
                      <td key={tf} className="px-1">
                        <div className={`h-7 rounded-md border flex items-center justify-center font-mono text-[11px] ${biasClasses(cell.bias)}`}>
                          {cell.bullCount}↑/{cell.bearCount}↓
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2">
                    <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${strengthBadge(r.strength)}`}>
                      {r.bias}
                    </span>
                  </td>
                  <td className={`px-2 text-[11px] whitespace-nowrap ${sweepClass}`}>
                    {sweepText}
                  </td>
                </tr>
              );
            })}
            {!rows.length && !loading && (
              <tr><td colSpan={7} className="px-2 py-6 text-center text-text-muted">No data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
