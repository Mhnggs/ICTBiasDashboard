export default function Checklist({ items }) {
  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl bg-bg-card border border-border p-5">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
          Pre-Trade Checklist
        </h3>
        <p className="text-text-muted text-sm">No checklist available</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-bg-card border border-border p-5">
      <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
        Pre-Trade Checklist
      </h3>
      <div className="space-y-2">
        {items.map((item, i) => {
          const dotColor =
            item.passed === true
              ? 'bg-bull'
              : item.passed === false
              ? 'bg-bear'
              : 'bg-warn';
          const statusText =
            item.passed === true
              ? 'YES'
              : item.passed === false
              ? 'NO'
              : 'CHECK';
          const statusColor =
            item.passed === true
              ? 'text-bull'
              : item.passed === false
              ? 'text-bear'
              : 'text-warn';

          return (
            <div
              key={i}
              className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-md hover:bg-bg-primary/60 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${dotColor}`} />
                <span className="text-sm text-text-secondary truncate">{item.text}</span>
              </div>
              <span className={`text-xs font-bold ${statusColor} flex-shrink-0`}>
                {statusText}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
