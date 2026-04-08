import { useState, useMemo, useEffect, useCallback } from 'react';
import axios from 'axios';

const ATR_INTERVALS = ['15min', '30min', '1h', '4h'];

export default function RiskCalculator({ pair }) {
  const [account, setAccount] = useState(100000);
  const [riskPct, setRiskPct] = useState(1);
  const [slPips, setSlPips] = useState(15);
  const [rr, setRr] = useState(3);
  const [atrInterval, setAtrInterval] = useState('15min');
  const [atrMult, setAtrMult] = useState(1.5);
  const [atrData, setAtrData] = useState(null);
  const [atrLoading, setAtrLoading] = useState(false);
  const [atrError, setAtrError] = useState(null);

  const isJpy = pair?.includes('JPY');
  const pipSize = isJpy ? 0.01 : 0.0001;

  const fetchATR = useCallback(async () => {
    if (!pair) return;
    setAtrLoading(true);
    setAtrError(null);
    try {
      const symbol = pair.replace('/', '-');
      const res = await axios.get(`/api/atr/${symbol}?interval=${atrInterval}&period=14`);
      setAtrData(res.data);
    } catch (err) {
      setAtrError(err.response?.data?.error || err.message);
    } finally {
      setAtrLoading(false);
    }
  }, [pair, atrInterval]);

  // Auto-load ATR when pair or interval changes
  useEffect(() => {
    fetchATR();
  }, [fetchATR]);

  const atrPips = useMemo(() => {
    if (!atrData?.atr) return null;
    return atrData.atr / pipSize;
  }, [atrData, pipSize]);

  const suggestedSlPips = useMemo(() => {
    if (atrPips == null) return null;
    return Math.round(atrPips * atrMult);
  }, [atrPips, atrMult]);

  const applyAtrSL = () => {
    if (suggestedSlPips != null) setSlPips(suggestedSlPips);
  };

  const calc = useMemo(() => {
    const riskAmt = account * (riskPct / 100);
    const pipValue = 10; // $10 per pip per standard lot
    const lotSize = slPips > 0 ? riskAmt / (slPips * pipValue) : 0;
    const tpPips = slPips * rr;
    const profit = riskAmt * rr;
    return { riskAmt, lotSize, tpPips, profit };
  }, [account, riskPct, slPips, rr]);

  return (
    <div className="rounded-xl bg-bg-card border border-border p-5">
      <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
        Position Size Calculator
      </h3>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-text-muted block mb-1">Account ($)</label>
          <input
            type="number"
            value={account}
            onChange={(e) => setAccount(Number(e.target.value))}
            className="w-full bg-bg-primary border border-border rounded-md px-3 py-1.5 font-mono text-sm text-text-primary focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-xs text-text-muted block mb-1">Risk (%)</label>
          <input
            type="number"
            step="0.5"
            value={riskPct}
            onChange={(e) => setRiskPct(Number(e.target.value))}
            className="w-full bg-bg-primary border border-border rounded-md px-3 py-1.5 font-mono text-sm text-text-primary focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-xs text-text-muted block mb-1">SL (pips)</label>
          <input
            type="number"
            value={slPips}
            onChange={(e) => setSlPips(Number(e.target.value))}
            className="w-full bg-bg-primary border border-border rounded-md px-3 py-1.5 font-mono text-sm text-text-primary focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-xs text-text-muted block mb-1">R:R Ratio</label>
          <input
            type="number"
            step="0.5"
            value={rr}
            onChange={(e) => setRr(Number(e.target.value))}
            className="w-full bg-bg-primary border border-border rounded-md px-3 py-1.5 font-mono text-sm text-text-primary focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* ATR-based SL helper */}
      {pair && (
        <div className="border-t border-border pt-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-text-muted uppercase tracking-wider">ATR-based SL</span>
            <div className="flex items-center gap-1.5">
              <select
                value={atrInterval}
                onChange={(e) => setAtrInterval(e.target.value)}
                className="bg-bg-primary border border-border rounded text-[11px] px-1.5 py-0.5 text-text-secondary"
              >
                {ATR_INTERVALS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
              <input
                type="number"
                step="0.1"
                value={atrMult}
                onChange={(e) => setAtrMult(Number(e.target.value))}
                className="w-12 bg-bg-primary border border-border rounded text-[11px] px-1.5 py-0.5 font-mono text-text-secondary"
              />
              <span className="text-[10px] text-text-muted">× ATR</span>
            </div>
          </div>
          {atrLoading && <div className="text-[11px] text-text-muted">Loading ATR…</div>}
          {atrError && <div className="text-[11px] text-bear">{atrError}</div>}
          {atrData?.atr && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-mono text-text-secondary">
                ATR({atrInterval}) = {atrPips?.toFixed(1)} pips
              </span>
              <button
                onClick={applyAtrSL}
                className="px-2 py-0.5 rounded bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 font-mono"
              >
                Use {suggestedSlPips} pips
              </button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex justify-between text-sm">
          <span className="text-text-muted">Risk Amount</span>
          <span className="font-mono text-bear">${calc.riskAmt.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-muted">Lot Size</span>
          <span className="font-mono text-text-primary">{calc.lotSize.toFixed(2)} lots</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-muted">TP Distance</span>
          <span className="font-mono text-text-primary">{calc.tpPips} pips</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-muted">Potential Profit</span>
          <span className="font-mono text-bull">${calc.profit.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
