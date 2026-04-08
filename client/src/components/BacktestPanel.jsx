import { useState, useCallback } from 'react';
import axios from 'axios';

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'GBP/JPY', 'AUD/USD', 'NZD/USD'];

export default function BacktestPanel() {
  const [pair, setPair] = useState(PAIRS[0]);
  const [days, setDays] = useState(30);
  const [onlyAligned, setOnlyAligned] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const symbol = pair.replace('/', '-');
      const res = await axios.get(
        `/api/backtest/${symbol}?days=${days}&onlyAligned=${onlyAligned ? 1 : 0}`
      );
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setRunning(false);
    }
  }, [pair, days, onlyAligned]);

  const stats = result?.stats;

  return (
    <div className="rounded-xl bg-bg-card border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
          Backtest · Asia Sweep
        </h3>
      </div>

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div>
          <label className="text-[10px] text-text-muted uppercase block">Pair</label>
          <select
            value={pair}
            onChange={(e) => setPair(e.target.value)}
            className="bg-bg-primary border border-border rounded text-xs px-2 py-1 text-text-primary"
          >
            {PAIRS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-text-muted uppercase block">Days</label>
          <input
            type="number"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-16 bg-bg-primary border border-border rounded text-xs px-2 py-1 text-text-primary font-mono"
          />
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <input
            type="checkbox"
            checked={onlyAligned}
            onChange={(e) => setOnlyAligned(e.target.checked)}
            className="accent-accent"
          />
          Aligned only
        </label>
        <button
          onClick={run}
          disabled={running}
          className="ml-auto text-xs px-3 py-1 rounded-md bg-accent text-bg-primary font-semibold hover:bg-accent/80 disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run'}
        </button>
      </div>

      {error && <div className="text-bear text-xs mb-2">{error}</div>}

      {stats && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3 text-center">
            <div className="bg-bg-primary rounded-md p-2 border border-border">
              <div className="text-[9px] text-text-muted uppercase">Trades</div>
              <div className="font-mono text-base text-text-primary">{stats.total}</div>
            </div>
            <div className="bg-bg-primary rounded-md p-2 border border-border">
              <div className="text-[9px] text-text-muted uppercase">Win Rate</div>
              <div className={`font-mono text-base ${stats.winRate >= 50 ? 'text-bull' : 'text-bear'}`}>
                {stats.winRate != null ? `${stats.winRate.toFixed(0)}%` : '—'}
              </div>
            </div>
            <div className="bg-bg-primary rounded-md p-2 border border-border">
              <div className="text-[9px] text-text-muted uppercase">Expectancy</div>
              <div className={`font-mono text-base ${stats.expectancy >= 0 ? 'text-bull' : 'text-bear'}`}>
                {stats.expectancy != null ? `${stats.expectancy.toFixed(2)}R` : '—'}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3 text-center">
            <div className="bg-bg-primary rounded-md p-2 border border-border">
              <div className="text-[9px] text-text-muted uppercase">Wins</div>
              <div className="font-mono text-xs text-bull">{stats.wins}</div>
            </div>
            <div className="bg-bg-primary rounded-md p-2 border border-border">
              <div className="text-[9px] text-text-muted uppercase">Losses</div>
              <div className="font-mono text-xs text-bear">{stats.losses}</div>
            </div>
            <div className="bg-bg-primary rounded-md p-2 border border-border">
              <div className="text-[9px] text-text-muted uppercase">Total R</div>
              <div className={`font-mono text-xs ${stats.totalR >= 0 ? 'text-bull' : 'text-bear'}`}>
                {stats.totalR.toFixed(1)}R
              </div>
            </div>
          </div>
          <div className="text-[10px] text-text-muted text-center mb-2">
            Scanned {result.rangesScanned} Asian sessions ·{' '}
            Aligned win rate: {stats.alignedWinRate != null ? `${stats.alignedWinRate.toFixed(0)}%` : '—'}
          </div>

          <div className="space-y-0.5 max-h-40 overflow-y-auto border-t border-border pt-2">
            {result.trades.slice(-15).reverse().map((t, i) => (
              <div key={i} className="flex items-center justify-between text-[10px] font-mono px-1">
                <span className="text-text-muted">{t.sessionDate}</span>
                <span className={t.direction === 'LONG' ? 'text-bull' : 'text-bear'}>
                  {t.direction}
                </span>
                <span className={t.outcome === 'win' ? 'text-bull' : 'text-bear'}>
                  {t.outcome === 'win' ? '+' : ''}{t.r.toFixed(2)}R
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
