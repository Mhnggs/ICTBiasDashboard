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

  // Check if any timeframe has divergence
  const anyDiv = timeframes.some(tf => tf.divergence?.bearish || tf.divergence?.bullish);

  return (
    <div className="rounded-xl bg-bg-card border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
            Multi-Timeframe Bias
          </h3>
          {anyDiv && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-warn/15 text-warn border border-warn/30 animate-pulse">
              Divergence
            </span>
          )}
        </div>
        <span className={`text-xs font-bold ${overallColor}`}>{strengthLabel}</span>
      </div>

      <div className="space-y-3">
        {timeframes.map((tf) => {
          const tfColor =
            tf.bias === 'BULLISH' ? 'text-bull' : tf.bias === 'BEARISH' ? 'text-bear' : 'text-warn';
          const dotColor =
            tf.bias === 'BULLISH' ? 'bg-bull' : tf.bias === 'BEARISH' ? 'bg-bear' : 'bg-warn';
          const hasDiv = tf.divergence?.bearish || tf.divergence?.bullish;
          const divBorder = hasDiv ? 'border-warn/50' : 'border-border';

          return (
            <div key={tf.label} className={`border ${divBorder} rounded-md p-3 bg-bg-primary/30`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                  <span className="font-mono text-sm text-text-primary font-semibold">{tf.label}</span>
                  {hasDiv && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-warn/15 text-warn border border-warn/30">
                      {tf.divergence.bearish && tf.divergence.bullish
                        ? 'Bear + Bull Div'
                        : tf.divergence.bearish
                          ? 'Bearish Div'
                          : 'Bullish Div'}
                    </span>
                  )}
                </div>
                <span className={`text-xs font-bold ${tfColor}`}>
                  {tf.bias} ({tf.bullCount}↑ / {tf.bearCount}↓)
                </span>
              </div>

              {/* Divergence detail */}
              {tf.divergence?.details && (
                <div className="mb-2 px-2 py-1.5 rounded bg-warn/5 border border-warn/20 text-[11px] text-warn font-medium">
                  {tf.divergence.details}
                </div>
              )}

              {tf.factors && tf.factors.length > 0 && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                  {tf.factors.map((f, i) => (
                    <div key={i} className={`flex items-center gap-1.5 text-[11px] ${f.warning ? 'font-semibold' : ''}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${f.warning ? 'bg-warn' : f.bullish ? 'bg-bull' : 'bg-bear'}`} />
                      <span className={`truncate ${f.warning ? 'text-warn' : 'text-text-muted'}`}>{f.name}</span>
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
