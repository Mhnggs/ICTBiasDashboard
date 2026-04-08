import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

function statusBadge(s) {
  if (s === 'win') return 'bg-bull/30 text-bull border-bull/40';
  if (s === 'loss') return 'bg-bear/30 text-bear border-bear/40';
  if (s === 'expired') return 'bg-bg-primary text-text-muted border-border';
  return 'bg-warn/20 text-warn border-warn/40';
}

export default function JournalPanel() {
  const [signals, setSignals] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, st] = await Promise.all([
        axios.get('/api/journal/list?limit=30'),
        axios.get('/api/journal/stats'),
      ]);
      setSignals(list.data.signals || []);
      setStats(st.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const overall = stats?.overall;

  return (
    <div className="rounded-xl bg-bg-card border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
          Trade Journal
        </h3>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs px-2.5 py-1 rounded-md bg-bg-primary border border-border text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="text-bear text-xs mb-2">{error}</div>}

      {overall && (
        <div className="grid grid-cols-4 gap-2 mb-3 text-center">
          <div className="bg-bg-primary rounded-md p-2 border border-border">
            <div className="text-[9px] text-text-muted uppercase">Total</div>
            <div className="font-mono text-sm text-text-primary">{overall.total}</div>
          </div>
          <div className="bg-bg-primary rounded-md p-2 border border-border">
            <div className="text-[9px] text-text-muted uppercase">Win Rate</div>
            <div className="font-mono text-sm text-bull">
              {overall.winRate != null ? `${overall.winRate.toFixed(0)}%` : '—'}
            </div>
          </div>
          <div className="bg-bg-primary rounded-md p-2 border border-border">
            <div className="text-[9px] text-text-muted uppercase">Aligned</div>
            <div className="font-mono text-sm text-accent">
              {overall.alignedWinRate != null ? `${overall.alignedWinRate.toFixed(0)}%` : '—'}
            </div>
          </div>
          <div className="bg-bg-primary rounded-md p-2 border border-border">
            <div className="text-[9px] text-text-muted uppercase">Open</div>
            <div className="font-mono text-sm text-warn">{overall.open}</div>
          </div>
        </div>
      )}

      <div className="space-y-1 max-h-64 overflow-y-auto">
        {!signals.length && !loading && (
          <div className="text-[11px] text-text-muted py-2 text-center">
            No signals yet. Logged automatically from sweep alerts.
          </div>
        )}
        {signals.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between px-2 py-1.5 rounded-md border border-border bg-bg-primary/30"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="font-mono text-[11px] text-text-primary font-semibold">{s.pair}</span>
              <span className={`text-[9px] uppercase ${s.direction === 'LONG' ? 'text-bull' : 'text-bear'}`}>
                {s.direction}
              </span>
              {s.aligned ? (
                <span className="text-[9px] uppercase font-bold px-1 rounded bg-accent/30 text-accent">
                  A
                </span>
              ) : null}
              <span className="text-[9px] text-text-muted truncate">
                {new Date(s.created_at).toLocaleTimeString()}
              </span>
            </div>
            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${statusBadge(s.status)}`}>
              {s.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
