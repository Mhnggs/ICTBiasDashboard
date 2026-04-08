import { useEffect, useRef, useState } from 'react';

// Plays a short beep using the Web Audio API. No external sound file.
function beep(freq = 880, durationMs = 180, type = 'sine') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.05);
  } catch {
    // ignore audio errors
  }
}

function ensureNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

export default function AlertsPanel({ alerts, latestAlert, onSelectPair }) {
  const [muted, setMuted] = useState(false);
  const lastAlertIdRef = useRef(null);

  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  // Trigger sound + browser notification when a brand-new alert arrives
  useEffect(() => {
    if (!latestAlert || latestAlert.id === lastAlertIdRef.current) return;
    lastAlertIdRef.current = latestAlert.id;

    if (!muted) {
      // Higher pitch + double beep when aligned with bias (true setup)
      if (latestAlert.aligned) {
        beep(1100, 180);
        setTimeout(() => beep(1400, 220), 200);
      } else {
        beep(680, 220);
      }
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(latestAlert.aligned ? '🎯 Setup Live' : '⚠ Asia Sweep', {
          body: latestAlert.message,
          tag: latestAlert.id,
        });
      } catch {
        // ignore
      }
    }
  }, [latestAlert, muted]);

  const list = (alerts || []).slice(0, 12);

  return (
    <div className="rounded-xl bg-bg-card border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
          Sweep Alerts
        </h3>
        <button
          onClick={() => setMuted((m) => !m)}
          className="text-[11px] px-2 py-0.5 rounded border border-border text-text-secondary hover:text-text-primary"
        >
          {muted ? '🔇 Muted' : '🔔 Sound On'}
        </button>
      </div>

      {!list.length && (
        <div className="text-[11px] text-text-muted py-3">
          No sweeps yet. Will alert when Asia high/low is taken.
        </div>
      )}

      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {list.map((a) => {
          const color = a.aligned
            ? 'border-bull/40 bg-bull/10'
            : 'border-warn/30 bg-warn/5';
          const sideColor = a.side === 'high' ? 'text-bear' : 'text-bull';
          const time = new Date(a.timestamp).toLocaleTimeString();
          return (
            <div
              key={a.id}
              onClick={() => onSelectPair?.(a.pair)}
              className={`cursor-pointer rounded-md border ${color} px-2.5 py-1.5 hover:bg-bg-primary/40 transition-colors`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-text-primary font-semibold">
                    {a.pair}
                  </span>
                  <span className={`text-[10px] uppercase font-bold ${sideColor}`}>
                    {a.side === 'high' ? 'HIGH SWEPT' : 'LOW SWEPT'}
                  </span>
                  {a.aligned && (
                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-bull text-bg-primary">
                      Aligned
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-text-muted font-mono">{time}</span>
              </div>
              <div className="text-[10px] text-text-muted mt-0.5">
                bias {a.bias} · {a.strength} · @ {a.price}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
