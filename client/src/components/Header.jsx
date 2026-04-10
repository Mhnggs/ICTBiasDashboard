import { useState, useEffect, useMemo } from "react";
import React from "react";

const SESSIONS = [
  { key: 'ASIAN',    label: 'Asia',     startHour: 19, endHour: 4,  color: 'bg-info',          dotColor: 'bg-info',          textColor: 'text-info' },
  { key: 'LONDON',   label: 'London',   startHour: 2,  endHour: 12, color: 'bg-warn',          dotColor: 'bg-warn',          textColor: 'text-warn' },
  { key: 'NEW_YORK', label: 'New York', startHour: 7,  endHour: 17, color: 'bg-accent-bright', dotColor: 'bg-accent-bright', textColor: 'text-accent-bright' },
];

const KILLZONES = [
  { label: 'London Open',  start: 2,  end: 5  },
  { label: 'NY Open',      start: 7,  end: 10 },
  { label: 'London Close', start: 10, end: 12 },
];

function hourToPercent(h) {
  return (h / 24) * 100;
}

export default function Header({ session }) {
  const [clock, setClock] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }));
      setDate(now.toLocaleDateString("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        month: "short",
        day: "numeric",
      }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const currentPercent = useMemo(() => {
    if (!session?.estTime) return 0;
    const parts = session.estTime.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    return ((hours + minutes / 60) / 24) * 100;
  }, [session?.estTime]);

  const killzone = session?.activeKillzone;
  const activeSession = session?.activeSession;

  return (
    <header className="bg-bg-card/80 glass border-b border-border sticky top-0 z-50">
      {/* Top bar */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
              <span className="text-accent-bright font-black text-sm">ICT</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-text-primary tracking-tight leading-none">
                Bias Dashboard
              </h1>
              <p className="text-[10px] text-text-muted font-medium tracking-wider uppercase leading-none mt-0.5">
                Smart Money Concepts
              </p>
            </div>
          </div>

          {/* Center: active session / killzone */}
          <div className="hidden md:flex items-center gap-3">
            {activeSession && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-primary/60 border border-border-subtle">
                <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
                <span className="text-xs font-semibold text-text-secondary">{activeSession}</span>
              </div>
            )}
            {killzone && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bull/8 border border-bull/20 glow-pulse">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bull opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-bull" />
                </span>
                <span className="text-xs font-bold text-bull uppercase tracking-wider">{killzone}</span>
              </div>
            )}
          </div>

          {/* Right: date + clock */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-right mr-2">
              <span className="text-[10px] text-text-muted uppercase tracking-wider block leading-none">{date}</span>
            </div>
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-bg-primary/60 border border-border-subtle">
              <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest">EST</span>
              <span className="font-mono text-base font-semibold text-text-primary tracking-wider">{clock}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Session timeline bar */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 pb-2.5 pt-0.5">
        {/* Hour labels */}
        <div className="relative h-3.5 mb-0.5">
          {[0, 2, 4, 7, 10, 12, 16, 19, 22].map((h) => (
            <span
              key={h}
              className="absolute text-[9px] font-mono text-text-muted/60 -translate-x-1/2 font-medium"
              style={{ left: `${hourToPercent(h)}%` }}
            >
              {h.toString().padStart(2, '0')}
            </span>
          ))}
        </div>

        {/* Bar */}
        <div className="relative h-6 bg-bg-primary/80 rounded-full overflow-hidden border border-border-subtle">
          {/* Killzone highlights */}
          {KILLZONES.map((kz) => {
            const left = hourToPercent(kz.start);
            const width = hourToPercent(kz.end - kz.start);
            return (
              <div
                key={kz.label}
                className="absolute top-0 h-full bg-bull/8 border-l border-r border-bull/15"
                style={{ left: `${left}%`, width: `${width}%` }}
                title={kz.label}
              />
            );
          })}

          {/* Session blocks */}
          {SESSIONS.map((s) => {
            const start = s.startHour;
            const end = s.endHour;

            if (start < end) {
              return (
                <div
                  key={s.key}
                  className={`absolute top-0 h-full ${s.color} opacity-20 hover:opacity-35 transition-opacity duration-200`}
                  style={{ left: `${hourToPercent(start)}%`, width: `${hourToPercent(end - start)}%` }}
                  title={s.label}
                />
              );
            }

            return (
              <React.Fragment key={s.key}>
                <div
                  className={`absolute top-0 h-full ${s.color} opacity-20 hover:opacity-35 transition-opacity duration-200`}
                  style={{ left: `${hourToPercent(start)}%`, width: `${hourToPercent(24 - start)}%` }}
                  title={s.label}
                />
                <div
                  className={`absolute top-0 h-full ${s.color} opacity-20 hover:opacity-35 transition-opacity duration-200`}
                  style={{ left: '0%', width: `${hourToPercent(end)}%` }}
                  title={s.label}
                />
              </React.Fragment>
            );
          })}

          {/* Current time needle */}
          <div
            className="absolute top-0 h-full w-[2px] bg-text-primary z-10"
            style={{ left: `${currentPercent}%` }}
          >
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-text-primary rounded-full shadow-lg shadow-white/20" />
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 mt-1.5">
          {SESSIONS.map((s) => {
            const isActive = session?.activeSessionKey === s.key;
            return (
              <div key={s.key} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${s.dotColor} ${isActive ? 'opacity-100' : 'opacity-30'}`} />
                <span className={`text-[10px] font-semibold tracking-wide ${isActive ? s.textColor : 'text-text-muted/60'}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
          <div className="flex items-center gap-1.5 ml-2">
            <div className="w-2 h-2 rounded-full bg-bull/40" />
            <span className="text-[10px] font-semibold tracking-wide text-text-muted/60">Killzones</span>
          </div>
        </div>
      </div>
    </header>
  );
}
