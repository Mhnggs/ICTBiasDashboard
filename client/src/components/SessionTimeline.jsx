import React, { useMemo } from 'react';

const SESSIONS = [
  { key: 'ASIAN',    label: 'Asia',     startHour: 19, endHour: 4,  color: 'bg-info'   },
  { key: 'LONDON',   label: 'London',   startHour: 2,  endHour: 12, color: 'bg-warn'   },
  { key: 'NEW_YORK', label: 'New York', startHour: 7,  endHour: 17, color: 'bg-accent' },
];

const TOTAL_HOURS = 24;

function hourToPercent(hour) {
  return (hour / TOTAL_HOURS) * 100;
}

function normalizeHour(h) {
  return ((h % 24) + 24) % 24;
}

export default function SessionTimeline({ session }) {
  const currentPercent = useMemo(() => {
    if (!session?.estTime) return 0;
    const parts = session.estTime.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    return ((hours + minutes / 60) / TOTAL_HOURS) * 100;
  }, [session?.estTime]);

  return (
    <div className="bg-bg-card border border-border rounded-lg p-5">
      <h2 className="text-text-primary font-semibold text-sm uppercase tracking-wider mb-4">
        Session Timeline (EST)
      </h2>

      {/* Hour labels */}
      <div className="relative h-4 mb-1">
        {[0, 4, 8, 12, 16, 20].map((h) => (
          <span
            key={h}
            className="absolute text-text-muted text-[10px] -translate-x-1/2"
            style={{ left: `${hourToPercent(h)}%` }}
          >
            {h.toString().padStart(2, '0')}
          </span>
        ))}
      </div>

      {/* Timeline bar */}
      <div className="relative h-8 bg-bg-primary rounded-md overflow-hidden border border-border">
        {SESSIONS.map((s) => {
          const start = s.startHour;
          const end = s.endHour;

          if (start < end) {
            const left = hourToPercent(start);
            const width = hourToPercent(end - start);
            return (
              <div
                key={s.key}
                className={`absolute top-0 h-full ${s.color} opacity-30 hover:opacity-50 transition-opacity`}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={s.label}
              />
            );
          }

          // Wraps midnight
          const leftA = hourToPercent(start);
          const widthA = hourToPercent(24 - start);
          const widthB = hourToPercent(end);
          return (
            <React.Fragment key={s.key}>
              <div
                className={`absolute top-0 h-full ${s.color} opacity-30 hover:opacity-50 transition-opacity`}
                style={{ left: `${leftA}%`, width: `${widthA}%` }}
                title={s.label}
              />
              <div
                className={`absolute top-0 h-full ${s.color} opacity-30 hover:opacity-50 transition-opacity`}
                style={{ left: '0%', width: `${widthB}%` }}
                title={s.label}
              />
            </React.Fragment>
          );
        })}

        {/* Current time marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-text-primary z-10"
          style={{ left: `${currentPercent}%` }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-text-primary rounded-full" />
        </div>
      </div>

      {/* Session labels */}
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {SESSIONS.map((s) => {
          const isActive = session?.activeSessionKey === s.key;
          return (
            <div key={s.key} className="flex items-center gap-1.5">
              <div
                className={`w-2.5 h-2.5 rounded-sm ${s.color} ${
                  isActive ? 'opacity-100' : 'opacity-40'
                }`}
              />
              <span
                className={`text-xs ${
                  isActive ? 'text-text-primary font-semibold' : 'text-text-muted'
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
        {session?.activeSession && (
          <span className="ml-auto text-xs text-bull font-medium">
            Active: {session.activeSession}
          </span>
        )}
      </div>

      {session?.estTime && (
        <p className="text-text-muted text-xs mt-2">
          Current EST: {session.estTime}
        </p>
      )}
    </div>
  );
}
