import { useEffect, useRef, useState } from 'react';

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
  } catch { /* ignore */ }
}

function tripleBeep() {
  beep(600, 120);
  setTimeout(() => beep(800, 120), 150);
  setTimeout(() => beep(600, 120), 300);
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

  useEffect(() => { ensureNotificationPermission(); }, []);

  useEffect(() => {
    if (!latestAlert || latestAlert.id === lastAlertIdRef.current) return;
    lastAlertIdRef.current = latestAlert.id;

    if (!muted) {
      if (latestAlert.type === 'news') {
        tripleBeep();
      } else if (latestAlert.aligned) {
        beep(1100, 180);
        setTimeout(() => beep(1400, 220), 200);
      } else {
        beep(680, 220);
      }
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const isNews = latestAlert.type === 'news';
        new Notification(
          isNews ? `News: ${latestAlert.currency}` : latestAlert.aligned ? 'Setup Live' : 'Asia Sweep',
          { body: latestAlert.message, tag: latestAlert.id }
        );
      } catch { /* ignore */ }
    }
  }, [latestAlert, muted]);

  const list = (alerts || []).slice(0, 15);

  return (
    <div className="rounded-xl bg-bg-card border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
          Alerts
        </h3>
        <button
          onClick={() => setMuted((m) => !m)}
          className="text-[11px] px-2 py-0.5 rounded border border-border text-text-secondary hover:text-text-primary"
        >
          {muted ? 'Muted' : 'Sound On'}
        </button>
      </div>

      {!list.length && (
        <div className="text-[11px] text-text-muted py-3">
          No alerts yet. Monitors sweeps and upcoming news.
        </div>
      )}

      <div className="space-y-1.5 max-h-80 overflow-y-auto">
        {list.map((a) => {
          if (a.type === 'news') return <NewsAlertRow key={a.id} alert={a} />;
          return <SweepAlertRow key={a.id} alert={a} onSelectPair={onSelectPair} />;
        })}
      </div>
    </div>
  );
}

function NewsAlertRow({ alert: a }) {
  const time = new Date(a.timestamp).toLocaleTimeString();
  const isHigh = a.importance >= 3;
  const borderClass = isHigh ? 'border-bear/40 bg-bear/8' : 'border-warn/30 bg-warn/5';
  const badgeClass = isHigh ? 'bg-bear text-bg-primary' : 'bg-warn/70 text-bg-primary';

  return (
    <div className={`rounded-md border ${borderClass} px-2.5 py-2`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${badgeClass}`}>
            {a.currency}
          </span>
          <span className="text-[11px] text-text-primary font-medium truncate">{a.title}</span>
        </div>
        <span className="text-[10px] text-text-muted font-mono flex-shrink-0 ml-2">{time}</span>
      </div>
      <div className="text-[10px] text-text-muted mt-0.5">{a.message}</div>
    </div>
  );
}

function SweepAlertRow({ alert: a, onSelectPair }) {
  const color = a.aligned ? 'border-bull/40 bg-bull/10' : 'border-warn/30 bg-warn/5';
  const sideColor = a.side === 'high' ? 'text-bear' : 'text-bull';
  const time = new Date(a.timestamp).toLocaleTimeString();

  return (
    <div
      onClick={() => onSelectPair?.(a.pair)}
      className={`cursor-pointer rounded-md border ${color} px-2.5 py-1.5 hover:bg-bg-primary/40 transition-colors`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-text-primary font-semibold">{a.pair}</span>
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
}
