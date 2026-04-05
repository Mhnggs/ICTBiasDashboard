import React from 'react';

export default function KillzoneStatus({ session }) {
  const killzones = session?.killzones || [];
  const nextKillzone = session?.nextKillzone;
  const activeKillzone = session?.activeKillzone;

  function getStatus(kz) {
    if (kz.active) return 'active';
    // A killzone is "past" if it's not active and appears before the active one,
    // or if there's no active one and it's before the next one.
    // Simple heuristic: compare by index with the active killzone.
    return 'upcoming';
  }

  // Determine which killzones are past by checking if they come before
  // the currently active killzone or, when none is active, the next one.
  const activeIdx = killzones.findIndex((kz) => kz.active);
  const referenceIdx = activeIdx >= 0 ? activeIdx : killzones.findIndex((kz) => kz.name === nextKillzone?.name);

  function resolveStatus(kz, idx) {
    if (kz.active) return 'active';
    if (referenceIdx >= 0 && idx < referenceIdx) return 'past';
    return 'upcoming';
  }

  function formatMinutes(m) {
    if (m == null) return '';
    const hrs = Math.floor(m / 60);
    const mins = m % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  }

  return (
    <div className="bg-bg-card border border-border rounded-lg p-5">
      <h2 className="text-text-primary font-semibold text-sm uppercase tracking-wider mb-4">
        Killzone Status
      </h2>

      <div className="space-y-2">
        {killzones.map((kz, idx) => {
          const status = resolveStatus(kz, idx);

          return (
            <div
              key={kz.name}
              className={`flex items-center justify-between px-3 py-2 rounded-md border ${
                status === 'active'
                  ? 'border-bull/40 bg-bull/5'
                  : status === 'past'
                  ? 'border-border/50 bg-bg-primary/40 opacity-50'
                  : 'border-border bg-bg-primary/20'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {/* Status dot */}
                <div className="relative flex items-center justify-center w-3 h-3">
                  {status === 'active' ? (
                    <span className="pulse-dot w-2.5 h-2.5 rounded-full bg-bull" />
                  ) : status === 'past' ? (
                    <span className="w-2 h-2 rounded-full bg-text-muted/40" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-text-secondary/60" />
                  )}
                </div>

                <span
                  className={`text-sm font-medium ${
                    status === 'active'
                      ? 'text-bull'
                      : status === 'past'
                      ? 'text-text-muted'
                      : 'text-text-secondary'
                  }`}
                >
                  {kz.name}
                </span>
              </div>

              <span className="text-xs text-text-muted font-mono">
                {kz.start} - {kz.end}
              </span>
            </div>
          );
        })}
      </div>

      {/* Next killzone countdown */}
      {!activeKillzone && nextKillzone && (
        <div className="mt-4 px-3 py-2.5 rounded-md bg-accent/10 border border-accent/30">
          <p className="text-xs text-text-secondary">
            Next killzone:{' '}
            <span className="text-accent font-semibold">{nextKillzone.name}</span>
          </p>
          <p className="text-lg font-mono text-accent mt-0.5">
            {formatMinutes(nextKillzone.minutesUntil)}
          </p>
        </div>
      )}
    </div>
  );
}
