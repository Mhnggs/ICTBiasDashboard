import { useState, useMemo } from 'react';

export default function RiskCalculator() {
  const [account, setAccount] = useState(100000);
  const [riskPct, setRiskPct] = useState(1);
  const [slPips, setSlPips] = useState(15);
  const [rr, setRr] = useState(3);

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
