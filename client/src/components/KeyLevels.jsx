const TYPE_STYLES = {
  resistance: { dot: "bg-bear", label: "text-bear", badge: "Resistance" },
  support: { dot: "bg-bull", label: "text-bull", badge: "Support" },
  demand: { dot: "bg-bull", label: "text-bull", badge: "Demand" },
  supply: { dot: "bg-bear", label: "text-bear", badge: "Supply" },
  fvg: { dot: "bg-accent", label: "text-accent", badge: "FVG" },
};

function getStyle(type) {
  const key = (type ?? "").toLowerCase();
  return TYPE_STYLES[key] ?? { dot: "bg-text-muted", label: "text-text-secondary", badge: type };
}

export default function KeyLevels({ levels, pair }) {
  if (!levels || levels.length === 0) {
    return (
      <div className="rounded-xl bg-bg-card border border-border p-5">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
          Key Levels
        </h3>
        <p className="text-text-muted text-sm">No levels available</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-bg-card border border-border p-5">
      <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
        Key Levels {pair && <span className="text-text-secondary">- {pair}</span>}
      </h3>

      <div className="space-y-1">
        {/* Header */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-2 py-1 text-xs text-text-muted uppercase tracking-wider">
          <span>Label</span>
          <span className="text-right">Price</span>
          <span className="text-right">Type</span>
        </div>

        {levels.map((level, i) => {
          const style = getStyle(level.type);
          const isZone = Array.isArray(level.value);

          return (
            <div
              key={`${level.label}-${i}`}
              className="grid grid-cols-[1fr_auto_auto] gap-3 items-center rounded-md px-2 py-2 hover:bg-bg-primary/60 transition-colors"
            >
              {/* Label */}
              <span className="text-sm text-text-primary truncate">
                {level.label}
              </span>

              {/* Price / range */}
              <span className="font-mono text-sm text-text-primary text-right whitespace-nowrap">
                {isZone
                  ? `${level.value[0]} - ${level.value[1]}`
                  : level.value}
              </span>

              {/* Type badge */}
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.label} justify-end`}
              >
                <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                {style.badge}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
