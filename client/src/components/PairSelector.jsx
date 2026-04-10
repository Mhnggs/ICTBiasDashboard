export default function PairSelector({
  pairs,
  selectedPair,
  onSelect,
  onFetchPair,
  onFetchAll,
  loading,
  allData,
  lastFetch,
}) {
  const dotColor = (pair) => {
    const d = allData?.[pair];
    if (!d) return "bg-text-muted/40";
    if (d.bias === "BULLISH") return "bg-bull";
    if (d.bias === "BEARISH") return "bg-bear";
    return "bg-warn";
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Pair tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {pairs.map((pair) => (
          <button
            key={pair}
            onClick={() => onSelect(pair)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold border transition-all duration-200 ${
              pair === selectedPair
                ? "bg-accent/15 border-accent/50 text-accent-bright shadow-sm shadow-accent/10"
                : "bg-bg-primary/40 border-border-subtle text-text-secondary hover:border-text-muted hover:text-text-primary hover:bg-bg-primary/60"
            }`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${dotColor(pair)} transition-colors`} />
            <span className="font-mono tracking-wide">{pair}</span>
          </button>
        ))}
      </div>

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onFetchPair}
          disabled={loading}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-bold text-white transition-all hover:bg-accent-bright hover:shadow-lg hover:shadow-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "Fetching..." : "Fetch Bias"}
        </button>
        <button
          onClick={onFetchAll}
          disabled={loading}
          className="rounded-lg border border-accent/40 px-5 py-2 text-sm font-bold text-accent-bright transition-all hover:bg-accent/10 hover:border-accent/60 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Fetch All
        </button>

        {lastFetch && (
          <span className="ml-auto text-xs text-text-muted font-mono">
            {new Date(lastFetch).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        )}
      </div>
    </div>
  );
}
