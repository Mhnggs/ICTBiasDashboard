import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

function impColor(imp) {
  if (imp >= 3) return 'text-bear';
  if (imp >= 2) return 'text-warn';
  return 'text-text-muted';
}

function impDots(imp) {
  return '●'.repeat(imp) + '○'.repeat(3 - imp);
}

function relativeTime(ms) {
  const diff = ms - Date.now();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 60) return `${minutes >= 0 ? 'in ' : ''}${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `${hours >= 0 ? 'in ' : ''}${hours}h`;
  const days = Math.round(hours / 24);
  return `${days >= 0 ? 'in ' : ''}${days}d`;
}

export default function EconomicCalendar() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/calendar?hours=48&minImportance=2');
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10 * 60 * 1000); // refresh every 10 min
    return () => clearInterval(id);
  }, [load]);

  const events = data?.events || [];
  const next2hHigh = events.filter(
    (e) => e.importance >= 3 && e.timestampMs - Date.now() < 2 * 3600 * 1000 && e.timestampMs > Date.now()
  );

  return (
    <div className="rounded-xl bg-bg-card border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
          Economic Calendar
        </h3>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs px-2.5 py-1 rounded-md bg-bg-primary border border-border text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      {next2hHigh.length > 0 && (
        <div className="mb-3 px-3 py-2 rounded-md border border-bear/40 bg-bear/10 text-[11px] text-bear font-semibold">
          ⚠ HIGH-IMPACT NEWS WITHIN 2H — consider standing aside
        </div>
      )}

      {error && <div className="text-bear text-xs mb-2">{error}</div>}

      {!loading && !events.length && !error && (
        <div className="text-[11px] text-text-muted py-2">
          No medium/high-impact events in the next 48h.
        </div>
      )}

      <div className="space-y-1 max-h-72 overflow-y-auto">
        {events.slice(0, 30).map((e, i) => {
          const dt = new Date(e.timestampMs);
          const timeStr = dt.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          return (
            <div
              key={i}
              className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-bg-primary/40"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className={`text-[10px] font-mono ${impColor(e.importance)}`}>
                  {impDots(e.importance)}
                </span>
                <span className="text-[10px] font-mono text-text-secondary w-9">
                  {e.currency}
                </span>
                <span className="text-[11px] text-text-primary truncate">{e.title}</span>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[10px] text-text-secondary font-mono">{timeStr}</div>
                <div className="text-[9px] text-text-muted font-mono">{relativeTime(e.timestampMs)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
