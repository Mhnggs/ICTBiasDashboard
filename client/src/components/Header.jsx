import { useState, useEffect } from "react";

export default function Header({ session }) {
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = session?.estTime
        ? new Date(session.estTime)
        : new Date(
            new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
          );
      setClock(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session?.estTime]);

  const killzone = session?.activeKillzone;

  return (
    <header className="flex items-center justify-between bg-bg-card border-b border-border px-4 py-3 sm:px-6">
      {/* Logo */}
      <h1 className="text-lg sm:text-xl font-bold text-text-primary tracking-wide whitespace-nowrap">
        ICT Bias Dashboard
      </h1>

      {/* Right cluster: killzone + clock */}
      <div className="flex items-center gap-4">
        {/* Killzone indicator */}
        {killzone && (
          <div className="hidden sm:flex items-center gap-2 rounded-md bg-bg-primary px-3 py-1 border border-border">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bull opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-bull" />
            </span>
            <span className="text-sm font-medium text-bull">{killzone}</span>
          </div>
        )}

        {/* EST clock */}
        <div className="flex items-center gap-2 rounded-md bg-bg-primary px-3 py-1.5 border border-border">
          <span className="text-xs text-text-muted uppercase tracking-wider">
            EST
          </span>
          <span className="font-mono text-sm text-text-primary">{clock}</span>
        </div>
      </div>
    </header>
  );
}
