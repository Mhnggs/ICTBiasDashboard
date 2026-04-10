export default function BiasCard({ data, livePrice }) {
  if (!data) {
    return (
      <div className="rounded-2xl glass border border-border-subtle p-8 flex items-center justify-center min-h-[200px]">
        <span className="text-text-muted text-sm font-medium">
          Select a pair and fetch bias to view analysis
        </span>
      </div>
    );
  }

  const { pair, bias, confidence, currentPrice } = data;
  const displayPrice = livePrice?.price ?? currentPrice;
  const tickDir =
    livePrice?.prev != null && livePrice?.price != null
      ? livePrice.price > livePrice.prev
        ? 'up'
        : livePrice.price < livePrice.prev
        ? 'down'
        : 'flat'
      : 'flat';
  const tickColor =
    tickDir === 'up' ? 'text-bull' : tickDir === 'down' ? 'text-bear' : 'text-text-primary';

  const biasColor =
    bias === "BULLISH" ? "text-bull" : bias === "BEARISH" ? "text-bear" : "text-warn";

  const barColor =
    bias === "BULLISH" ? "bg-bull" : bias === "BEARISH" ? "bg-bear" : "bg-warn";

  const glowColor =
    bias === "BULLISH" ? "shadow-bull/10" : bias === "BEARISH" ? "shadow-bear/10" : "shadow-warn/10";

  const pct = Math.min(Math.max(confidence ?? 0, 0), 100);

  return (
    <div className={`rounded-2xl glass border border-border-subtle p-6 space-y-5 shadow-lg ${glowColor}`}>
      {/* Pair + price */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xs font-bold text-text-muted uppercase tracking-[0.15em] mb-1">
            {pair}
          </h2>
          <p className={`text-3xl sm:text-4xl font-black tracking-tight ${biasColor}`}>
            {bias ?? "---"}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[11px] text-text-muted font-semibold flex items-center justify-end gap-1.5 mb-1">
            {livePrice && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
            )}
            {livePrice ? 'LIVE' : 'PRICE'}
          </span>
          <p className={`font-mono text-xl font-bold transition-colors duration-300 ${tickColor}`}>
            {displayPrice != null ? displayPrice : "---"}
          </p>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="text-text-muted uppercase tracking-wider text-[11px]">Confidence</span>
          <span className="text-text-secondary font-mono">{pct.toFixed(0)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-bg-primary/80 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
