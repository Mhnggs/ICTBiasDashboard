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
    if (!d) return "bg-text-muted";
    if (d.bias === "BULLISH") return "bg-bull";
    if (d.bias === "BEARISH") return "bg-bear";
    return "bg-warn";
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Scrollable pair tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {pairs.map((pair) => (
          <button
            key={pair}
            onClick={() => onSelect(pair)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium border transition-colors ${
              pair === selectedPair
                ? "bg-accent/20 border-accent text-accent"
                : "bg-bg-card border-border text-text-secondary hover:border-text-muted hover:text-text-primary"
            }`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${dotColor(pair)}`}
            />
            {pair}
          </button>
        ))}
      </div>

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onFetchPair}
          disabled={loading}
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "Fetching..." : "Fetch Bias"}
        </button>
        <button
          onClick={onFetchAll}
          disabled={loading}
          className="rounded-md border border-accent px-4 py-1.5 text-sm font-semibold text-accent transition-opacity hover:bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Fetch All
        </button>

        {lastFetch && (
          <span className="ml-auto text-xs text-text-muted">
            Last fetch:{" "}
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
