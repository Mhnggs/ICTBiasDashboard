import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

function statusBadge(s) {
  if (s === 'closed_win') return 'bg-bull/30 text-bull border-bull/40';
  if (s === 'closed_loss') return 'bg-bear/30 text-bear border-bear/40';
  if (s === 'closed_manual') return 'bg-warn/20 text-warn border-warn/40';
  return 'bg-accent/20 text-accent border-accent/40';
}

function statusLabel(s) {
  if (s === 'closed_win') return 'WIN';
  if (s === 'closed_loss') return 'LOSS';
  if (s === 'closed_manual') return 'CLOSED';
  return 'OPEN';
}

export default function JournalPanel() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [collapsed, setCollapsed] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/trades?all=1');
      setTrades((res.data.trades || []).filter(t => t.status !== 'open'));
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

  const closedTrades = trades;
  const wins = closedTrades.filter(t => t.status === 'closed_win').length;
  const losses = closedTrades.filter(t => t.status === 'closed_loss').length;
  const total = wins + losses;
  const winRate = total > 0 ? (wins / total * 100).toFixed(0) : null;
  const totalR = closedTrades.reduce((acc, t) => acc + (t.pnl_r || 0), 0);

  return (
    <div className="rounded-2xl bg-bg-card border border-border">
      {/* Header — always visible, clickable to expand */}
      <div
        onClick={() => setCollapsed(v => !v)}
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-bg-primary/20 transition-colors rounded-2xl"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            Trade Journal
          </h3>
          {total > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-bg-primary border border-border text-text-secondary font-mono">
                {total} trades
              </span>
              <span className={`text-[10px] font-bold font-mono ${parseFloat(winRate) >= 50 ? 'text-bull' : 'text-bear'}`}>
                {winRate}% WR
              </span>
              <span className={`text-[10px] font-bold font-mono ${totalR >= 0 ? 'text-bull' : 'text-bear'}`}>
                {totalR >= 0 ? '+' : ''}{totalR.toFixed(1)}R
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!collapsed && (
            <button
              onClick={(e) => { e.stopPropagation(); load(); }}
              disabled={loading}
              className="text-[10px] px-2 py-0.5 rounded bg-bg-primary border border-border text-text-muted hover:text-text-primary disabled:opacity-50"
            >
              {loading ? '...' : 'Refresh'}
            </button>
          )}
          <span className="text-text-muted text-xs">{collapsed ? '+' : '−'}</span>
        </div>
      </div>

      {/* Collapsible body */}
      {!collapsed && (
        <div className="px-5 pb-5 space-y-3">
          {error && <div className="text-bear text-xs">{error}</div>}

          {total > 0 && (
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-bg-primary rounded-md p-2 border border-border">
                <div className="text-[9px] text-text-muted uppercase">Trades</div>
                <div className="font-mono text-sm text-text-primary">{total}</div>
              </div>
              <div className="bg-bg-primary rounded-md p-2 border border-border">
                <div className="text-[9px] text-text-muted uppercase">Win Rate</div>
                <div className={`font-mono text-sm ${parseFloat(winRate) >= 50 ? 'text-bull' : 'text-bear'}`}>
                  {winRate != null ? `${winRate}%` : '--'}
                </div>
              </div>
              <div className="bg-bg-primary rounded-md p-2 border border-border">
                <div className="text-[9px] text-text-muted uppercase">Total R</div>
                <div className={`font-mono text-sm ${totalR >= 0 ? 'text-bull' : 'text-bear'}`}>
                  {totalR >= 0 ? '+' : ''}{totalR.toFixed(1)}R
                </div>
              </div>
              <div className="bg-bg-primary rounded-md p-2 border border-border">
                <div className="text-[9px] text-text-muted uppercase">W / L</div>
                <div className="font-mono text-sm text-text-primary">{wins} / {losses}</div>
              </div>
            </div>
          )}

          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {!closedTrades.length && !loading && (
              <div className="text-[11px] text-text-muted py-4 text-center">
                No closed trades yet. Close trades from the Live Trades panel to see them here.
              </div>
            )}

          {closedTrades.map((t) => {
            const isExpanded = expandedId === t.id;
            const review = t.analysis;
            const isWin = t.status === 'closed_win';

            return (
              <div key={t.id} className="rounded-md border border-border bg-bg-primary/30">
                {/* Trade row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : t.id)}
                  className="flex items-center justify-between px-2.5 py-2 cursor-pointer hover:bg-bg-primary/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-mono text-[11px] text-text-primary font-semibold">{t.pair}</span>
                    <span className={`text-[9px] uppercase font-bold ${t.direction === 'LONG' ? 'text-bull' : 'text-bear'}`}>
                      {t.direction}
                    </span>
                    <span className={`font-mono text-[10px] font-bold ${isWin ? 'text-bull' : 'text-bear'}`}>
                      {t.pnl_pips > 0 ? '+' : ''}{t.pnl_pips}p
                      <span className="ml-1 opacity-70">({t.pnl_r > 0 ? '+' : ''}{t.pnl_r}R)</span>
                    </span>
                    <span className="text-[9px] text-text-muted">
                      {new Date(t.closed_at || t.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${statusBadge(t.status)}`}>
                      {statusLabel(t.status)}
                    </span>
                    {review && (
                      <span className="text-[10px] text-text-muted">{isExpanded ? '−' : '+'}</span>
                    )}
                  </div>
                </div>

                {/* Expanded analysis */}
                {isExpanded && review && (
                  <TradeReview review={review} trade={t} />
                )}
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}

function TradeReview({ review, trade }) {
  return (
    <div className="px-3 pb-3 pt-1 border-t border-border/50 space-y-2.5">
      {/* Summary row */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        <span className={`font-bold px-2 py-0.5 rounded ${review.outcome === 'WIN' ? 'bg-bull/15 text-bull' : 'bg-bear/15 text-bear'}`}>
          {review.outcome} {review.pnlUsd != null ? `${review.pnlUsd >= 0 ? '+' : '-'}$${Math.abs(review.pnlUsd).toFixed(2)}` : ''} ({review.pnlR > 0 ? '+' : ''}{review.pnlR}R)
        </span>
        <span className="text-text-muted px-2 py-0.5 rounded bg-bg-primary border border-border">
          Hold: {review.holdTime}
        </span>
        <span className="text-text-muted px-2 py-0.5 rounded bg-bg-primary border border-border">
          Planned R:R 1:{review.plannedRR}
        </span>
        <span className="text-text-muted px-2 py-0.5 rounded bg-bg-primary border border-border">
          {trade.entry_price} → {trade.exit_price}
        </span>
      </div>

      {/* What went right */}
      {review.wentRight?.length > 0 && (
        <div>
          <div className="text-[9px] font-bold uppercase text-bull tracking-wider mb-1">What went right</div>
          <div className="space-y-0.5">
            {review.wentRight.map((item, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10px] text-text-secondary">
                <span className="text-bull mt-0.5 flex-shrink-0">+</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What went wrong */}
      {review.wentWrong?.length > 0 && (
        <div>
          <div className="text-[9px] font-bold uppercase text-bear tracking-wider mb-1">What went wrong</div>
          <div className="space-y-0.5">
            {review.wentWrong.map((item, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10px] text-text-secondary">
                <span className="text-bear mt-0.5 flex-shrink-0">-</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lessons */}
      {review.lessons?.length > 0 && (
        <div>
          <div className="text-[9px] font-bold uppercase text-accent tracking-wider mb-1">Lessons</div>
          <div className="space-y-0.5">
            {review.lessons.map((item, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10px] text-text-secondary">
                <span className="text-accent mt-0.5 flex-shrink-0">*</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
