export default function BiasCard({ data, livePrice }) {
  if (!data) {
    return (
      <div className="rounded-xl bg-bg-card border border-border p-6 flex items-center justify-center min-h-[180px]">
        <span className="text-text-muted text-sm">
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
    bias === "BULLISH"
      ? "text-bull"
      : bias === "BEARISH"
      ? "text-bear"
      : "text-warn";

  const barColor =
    bias === "BULLISH"
      ? "bg-bull"
      : bias === "BEARISH"
      ? "bg-bear"
      : "bg-warn";

  const pct = Math.min(Math.max(confidence ?? 0, 0), 100);

  return (
    <div className="rounded-xl bg-bg-card border border-border p-6 space-y-4">
      {/* Pair + price */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-medium text-text-muted uppercase tracking-wider">
            {pair}
          </h2>
          <p className={`mt-1 text-3xl sm:text-4xl font-extrabold ${biasColor}`}>
            {bias ?? "---"}
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-text-muted flex items-center justify-end gap-1">
            {livePrice && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
            )}
            {livePrice ? 'Live' : 'Current Price'}
          </span>
          <p className={`font-mono text-lg transition-colors ${tickColor}`}>
            {displayPrice != null ? displayPrice : "---"}
          </p>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-text-secondary">
          <span>Confidence</span>
          <span>{pct.toFixed(0)}%</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-bg-primary overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
