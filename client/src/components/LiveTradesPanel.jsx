import { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'GBP/JPY', 'AUD/USD', 'NZD/USD'];

function suggestionStyle(type) {
  if (type === 'warning') return 'bg-bear/10 text-bear border-bear/25';
  if (type === 'caution') return 'bg-warn/10 text-warn border-warn/25';
  if (type === 'action') return 'bg-bull/10 text-bull border-bull/25';
  return 'bg-accent/10 text-accent border-accent/25';
}

export default function LiveTradesPanel({ livePrices, wsSymbol, switchSymbol }) {
  const [trades, setTrades] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef(null);

  // Form state
  const [form, setForm] = useState({
    pair: 'EUR/USD', direction: 'LONG',
    entry_price: '', sl_price: '', tp_price: '',
    lot_size: '0.01', notes: '',
  });

  const loadSnapshot = useCallback(async () => {
    try {
      const res = await axios.get('/api/trades/snapshot');
      setTrades(res.data.trades || []);
    } catch {
      // Fall back to basic list
      try {
        const res = await axios.get('/api/trades');
        setTrades(res.data.trades || []);
      } catch { /* ignore */ }
    }
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const res = await axios.get('/api/trades?all=1');
      setTrades(res.data.trades || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (showClosed) { loadAll(); return; }
    setLoading(true);
    loadSnapshot().finally(() => setLoading(false));
    pollRef.current = setInterval(loadSnapshot, 3000);
    return () => clearInterval(pollRef.current);
  }, [loadSnapshot, loadAll, showClosed]);

  // Auto-switch WS to the first open trade's pair on load
  useEffect(() => {
    const firstOpen = trades.find(t => t.status === 'open');
    if (firstOpen && switchSymbol && firstOpen.pair !== wsSymbol) {
      switchSymbol(firstOpen.pair);
    }
  }, [trades.length > 0 && trades.find(t => t.status === 'open')?.pair]); // eslint-disable-line

  // Merge live WS prices into trade snapshots for real-time updates
  const enrichedTrades = trades.map((t) => {
    if (t.status !== 'open') return t;
    const wsPrice = livePrices?.[t.pair]?.price;
    if (!wsPrice || !t.live) return t;
    const pip = t.pair.includes('JPY') ? 0.01 : 0.0001;
    const pvUsd = t.pair.includes('JPY') ? (wsPrice > 0 ? (0.01 / wsPrice) * 100000 : 6.5) : 10;
    const pnlRaw = t.direction === 'LONG' ? wsPrice - t.entry_price : t.entry_price - wsPrice;
    const pnlPips = pnlRaw / pip;
    const pnlUsd = pnlPips * pvUsd * t.lot_size;
    const risk = Math.abs(t.entry_price - t.sl_price);
    const rMultiple = risk > 0 ? pnlRaw / risk : 0;
    const tpDist = Math.abs(t.tp_price - t.entry_price);
    const slDist = Math.abs(t.sl_price - t.entry_price);
    const progress = pnlRaw >= 0
      ? (tpDist > 0 ? pnlRaw / tpDist : 0)
      : -(Math.abs(pnlRaw) / (slDist || 1));
    return {
      ...t,
      live: {
        ...t.live,
        currentPrice: wsPrice,
        pnlPips: Math.round(pnlPips * 10) / 10,
        pnlUsd: Math.round(pnlUsd * 100) / 100,
        rMultiple: Math.round(rMultiple * 100) / 100,
        progress: Math.round(progress * 1000) / 1000,
      },
    };
  });

  const openTrades = enrichedTrades.filter(t => t.status === 'open');
  const closedTrades = enrichedTrades.filter(t => t.status !== 'open');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post('/api/trades', form);
      // Auto-switch WS stream to this trade's pair for real-time ticks
      if (switchSymbol && form.pair !== wsSymbol) {
        switchSymbol(form.pair);
      }
      setForm(f => ({ ...f, entry_price: '', sl_price: '', tp_price: '', notes: '' }));
      setShowForm(false);
      loadSnapshot();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add trade');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async (id, pair) => {
    // Try WS price first, then snapshot price
    const trade = enrichedTrades.find(t => t.id === id);
    const price = livePrices?.[pair]?.price || trade?.live?.currentPrice;
    const input = prompt('Exit price:', price || '');
    if (!input) return;
    try {
      await axios.post(`/api/trades/${id}/close`, { exit_price: parseFloat(input) });
      loadSnapshot();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this trade?')) return;
    try {
      await axios.delete(`/api/trades/${id}`);
      loadSnapshot();
    } catch { /* ignore */ }
  };

  // Compute form R:R preview
  const formRR = (() => {
    const e = parseFloat(form.entry_price);
    const s = parseFloat(form.sl_price);
    const t = parseFloat(form.tp_price);
    if (!e || !s || !t) return null;
    const risk = Math.abs(e - s);
    const reward = Math.abs(t - e);
    return risk > 0 ? (reward / risk).toFixed(1) : null;
  })();

  const hasActive = openTrades.length > 0;

  // Compute total open P&L
  const totalPnl = openTrades.reduce((sum, t) => sum + (t.live?.pnlUsd || 0), 0);
  const totalPnlStr = fmtUsd(totalPnl);

  return (
    <div className={`rounded-2xl border p-5 transition-all duration-300 ${
      hasActive
        ? 'glass border-accent/30 shadow-lg shadow-accent/5 live-trade-active'
        : 'bg-bg-card border-border'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          {hasActive && (
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          )}
          <h3 className={`font-semibold uppercase tracking-wider ${
            hasActive ? 'text-sm text-text-primary' : 'text-xs text-text-muted'
          }`}>
            Live Trades
          </h3>
          {hasActive && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">
              {openTrades.length}
            </span>
          )}
          {hasActive && (
            <span className={`font-mono text-sm font-bold ${totalPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
              {totalPnlStr}
            </span>
          )}
          {wsSymbol && hasActive && (
            <span className="text-[9px] font-mono text-text-muted px-1.5 py-0.5 rounded bg-bg-primary border border-border flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
              WS: {wsSymbol}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActive && (
            <button
              onClick={() => setShowClosed(v => !v)}
              className="text-[10px] px-2 py-0.5 rounded bg-bg-primary border border-border text-text-muted hover:text-text-primary"
            >
              {showClosed ? 'Open only' : 'History'}
            </button>
          )}
          <button
            onClick={() => setShowForm(v => !v)}
            className={`text-xs px-2.5 py-1 rounded-md font-semibold ${
              hasActive
                ? 'bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30'
                : 'bg-accent text-white hover:bg-accent-bright'
            }`}
          >
            {showForm ? 'Cancel' : '+ Trade'}
          </button>
        </div>
      </div>

      {/* Add Trade Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 p-3 rounded-lg border border-border bg-bg-primary/40 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.pair}
              onChange={e => setForm(f => ({ ...f, pair: e.target.value }))}
              className="bg-bg-primary border border-border rounded px-2 py-1.5 text-xs text-text-primary"
            >
              {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select
              value={form.direction}
              onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}
              className="bg-bg-primary border border-border rounded px-2 py-1.5 text-xs text-text-primary"
            >
              <option value="LONG">LONG</option>
              <option value="SHORT">SHORT</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number" step="any" required placeholder="Entry"
              value={form.entry_price}
              onChange={e => setForm(f => ({ ...f, entry_price: e.target.value }))}
              className="bg-bg-primary border border-border rounded px-2 py-1.5 text-xs text-text-primary font-mono placeholder:text-text-muted/50"
            />
            <input
              type="number" step="any" required placeholder="SL"
              value={form.sl_price}
              onChange={e => setForm(f => ({ ...f, sl_price: e.target.value }))}
              className="bg-bg-primary border border-bear/30 rounded px-2 py-1.5 text-xs text-text-primary font-mono placeholder:text-text-muted/50"
            />
            <input
              type="number" step="any" required placeholder="TP"
              value={form.tp_price}
              onChange={e => setForm(f => ({ ...f, tp_price: e.target.value }))}
              className="bg-bg-primary border border-bull/30 rounded px-2 py-1.5 text-xs text-text-primary font-mono placeholder:text-text-muted/50"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number" step="any" placeholder="Lots"
              value={form.lot_size}
              onChange={e => setForm(f => ({ ...f, lot_size: e.target.value }))}
              className="bg-bg-primary border border-border rounded px-2 py-1.5 text-xs text-text-primary font-mono placeholder:text-text-muted/50"
            />
            <input
              type="text" placeholder="Notes (optional)" className="col-span-2 bg-bg-primary border border-border rounded px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted/50"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex items-center justify-between">
            {formRR && (
              <span className="text-[10px] text-text-muted font-mono">R:R = 1:{formRR}</span>
            )}
            <button
              type="submit" disabled={submitting}
              className="ml-auto text-xs px-3 py-1.5 rounded-md bg-accent text-bg-primary font-bold hover:bg-accent-bright disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add Trade'}
            </button>
          </div>
        </form>
      )}

      {/* Open Trades */}
      <div className={hasActive ? 'space-y-3' : 'space-y-2'}>
        {!openTrades.length && !loading && !showClosed && !showForm && (
          <div className="text-[11px] text-text-muted py-2 text-center">
            No open trades &mdash; click <span className="text-accent font-semibold">+ Trade</span> to start tracking
          </div>
        )}

        {openTrades.map((t) => (
          <TradeCard key={t.id} trade={t} onClose={handleClose} onDelete={handleDelete}
            isStreaming={t.pair === wsSymbol}
            onStream={() => switchSymbol?.(t.pair)} />
        ))}

        {/* Closed trades (when toggled) */}
        {showClosed && closedTrades.length > 0 && (
          <>
            <div className="text-[10px] text-text-muted uppercase tracking-wider pt-2 border-t border-border mt-2">
              Closed
            </div>
            {closedTrades.map((t) => (
              <ClosedTradeRow key={t.id} trade={t} onDelete={handleDelete} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function fmtUsd(v) {
  if (v == null) return '--';
  const abs = Math.abs(v);
  return `${v >= 0 ? '+' : '-'}$${abs < 1000 ? abs.toFixed(2) : abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function TradeCard({ trade: t, onClose, onDelete, isStreaming, onStream }) {
  const live = t.live;
  const isProfit = live ? live.pnlUsd >= 0 : false;
  const pnlColor = !live ? 'text-text-muted' : isProfit ? 'text-bull' : 'text-bear';
  const pnlBg = !live ? '' : isProfit ? 'bg-bull/5' : 'bg-bear/5';

  const pct = live ? Math.min(Math.max((live.progress + 1) / 2 * 100, 0), 100) : 50;
  const barColor = !live ? 'bg-text-muted/30' : isProfit ? 'bg-bull' : 'bg-bear';

  return (
    <div className={`rounded-xl border bg-bg-primary/40 p-4 space-y-3 transition-all duration-300 ${
      isProfit ? 'border-bull/20' : live ? 'border-bear/20' : 'border-border'
    }`}>
      {/* Row 1: pair info + P&L */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-base text-text-primary font-bold">{t.pair}</span>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
            t.direction === 'LONG' ? 'bg-bull/15 text-bull border border-bull/25' : 'bg-bear/15 text-bear border border-bear/25'
          }`}>
            {t.direction}
          </span>
          <span className="text-[10px] text-text-muted font-mono">{t.lot_size} lot</span>
          {isStreaming && (
            <span className="flex items-center gap-1 text-[9px] text-bull font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" /> LIVE
            </span>
          )}
        </div>
        {live && (
          <div className={`flex items-center gap-3 px-3 py-1.5 rounded-lg ${pnlBg}`}>
            <span className={`font-mono text-lg font-bold ${pnlColor}`}>
              {fmtUsd(live.pnlUsd)}
            </span>
            <div className="flex flex-col items-end">
              <span className={`font-mono text-[10px] font-semibold ${pnlColor} opacity-70`}>
                {live.rMultiple > 0 ? '+' : ''}{live.rMultiple}R
              </span>
              <span className="font-mono text-[9px] text-text-muted">
                {live.pnlPips > 0 ? '+' : ''}{live.pnlPips} pips
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Row 2: progress bar SL → Entry → TP */}
      <div className="space-y-1.5">
        <div className="h-2 w-full rounded-full bg-bg-primary overflow-hidden relative border border-border/50">
          <div className="absolute left-1/2 top-0 w-px h-full bg-text-muted/30 -translate-x-1/2 z-10" />
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor} opacity-80`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] font-mono text-text-muted">
          <span className="text-bear/80">SL {t.sl_price}</span>
          <span className="text-text-secondary font-semibold">Entry {t.entry_price}</span>
          <span className="text-bull/80">TP {t.tp_price}</span>
        </div>
      </div>

      {/* Row 3: live price + distance */}
      {live && (
        <div className="flex items-center justify-between text-[10px] px-1">
          <span className="text-text-muted">
            Price: <span className={`font-mono font-bold text-[11px] ${pnlColor}`}>{live.currentPrice}</span>
          </span>
          <span className="font-mono flex items-center gap-3">
            <span className="text-bear/70">{live.distToSl}p to SL</span>
            <span className="text-bull/70">{live.distToTp}p to TP</span>
          </span>
        </div>
      )}

      {/* Row 4: suggestions */}
      {live?.suggestions?.length > 0 && (
        <div className="space-y-1.5">
          {live.suggestions.map((s, i) => (
            <div key={i} className={`text-[10px] px-2.5 py-1.5 rounded-md border ${suggestionStyle(s.type)}`}>
              {s.text}
            </div>
          ))}
        </div>
      )}

      {/* Row 5: actions */}
      <div className="flex items-center justify-between pt-2 border-t border-border/40">
        {t.notes && <span className="text-[9px] text-text-muted truncate max-w-[50%] italic">{t.notes}</span>}
        <div className="flex items-center gap-2 ml-auto">
          {!isStreaming && (
            <button
              onClick={onStream}
              className="text-[10px] px-2.5 py-1 rounded-md bg-accent/10 text-accent border border-accent/25 hover:bg-accent/20 font-medium"
            >
              Stream
            </button>
          )}
          <button
            onClick={() => onClose(t.id, t.pair)}
            className="text-[10px] px-2.5 py-1 rounded-md bg-warn/15 text-warn border border-warn/30 hover:bg-warn/25 font-medium"
          >
            Close Trade
          </button>
          <button
            onClick={() => onDelete(t.id)}
            className="text-[10px] px-2 py-1 rounded-md bg-bear/10 text-bear/60 border border-bear/20 hover:bg-bear/20"
          >
            Del
          </button>
        </div>
      </div>
    </div>
  );
}

function ClosedTradeRow({ trade: t, onDelete }) {
  const isWin = (t.pnl_r || 0) > 0;
  const pnlUsd = t.analysis?.pnlUsd;
  return (
    <div className="flex items-center justify-between px-2 py-1.5 rounded-md border border-border bg-bg-primary/20">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[11px] text-text-primary font-semibold">{t.pair}</span>
        <span className={`text-[9px] uppercase ${t.direction === 'LONG' ? 'text-bull' : 'text-bear'}`}>
          {t.direction}
        </span>
        <span className={`text-[10px] font-mono font-bold ${isWin ? 'text-bull' : 'text-bear'}`}>
          {pnlUsd != null ? fmtUsd(pnlUsd) : `${t.pnl_pips > 0 ? '+' : ''}${t.pnl_pips}p`}
          <span className="opacity-60 ml-1">({t.pnl_r > 0 ? '+' : ''}{t.pnl_r}R)</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
          isWin ? 'bg-bull/20 text-bull border-bull/40' : 'bg-bear/20 text-bear border-bear/40'
        }`}>
          {t.status.replace('closed_', '')}
        </span>
        <button onClick={() => onDelete(t.id)} className="text-[9px] text-text-muted hover:text-bear">x</button>
      </div>
    </div>
  );
}
