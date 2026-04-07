export default function MTFBiasPanel({ timeframes, strengthLabel, bias }) {
  if (!timeframes || timeframes.length === 0) {
    return (
      <div className="rounded-xl bg-bg-card border border-border p-5">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
          Multi-Timeframe Bias
        </h3>
        <p className="text-text-muted text-sm">No data</p>
      </div>
    );
  }

  const overallColor =
    bias === 'BULLISH' ? 'text-bull' : bias === 'BEARISH' ? 'text-bear' : 'text-warn';

  return (
    <div className="rounded-xl bg-bg-card border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
          Multi-Timeframe Bias
        </h3>
        <span className={`text-xs font-bold ${overallColor}`}>{strengthLabel}</span>
      </div>

      <div className="space-y-3">
        {timeframes.map((tf) => {
          const tfColor =
            tf.bias === 'BULLISH' ? 'text-bull' : tf.bias === 'BEARISH' ? 'text-bear' : 'text-warn';
          const dotColor =
            tf.bias === 'BULLISH' ? 'bg-bull' : tf.bias === 'BEARISH' ? 'bg-bear' : 'bg-warn';

          return (
            <div key={tf.label} className="border border-border rounded-md p-3 bg-bg-primary/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                  <span className="font-mono text-sm text-text-primary font-semibold">{tf.label}</span>
                </div>
                <span className={`text-xs font-bold ${tfColor}`}>
                  {tf.bias} ({tf.bullCount}↑ / {tf.bearCount}↓)
                </span>
              </div>
              {tf.factors && tf.factors.length > 0 && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                  {tf.factors.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px]">
                      <span className={`w-1.5 h-1.5 rounded-full ${f.bullish ? 'bg-bull' : 'bg-bear'}`} />
                      <span className="text-text-muted truncate">{f.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
