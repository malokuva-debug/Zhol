"use client";

import { useEffect, useState } from "react";

export default function TurnTimer({
  startedAt,
  seconds,
  active,
}: {
  startedAt: number;
  seconds: number;
  active: boolean;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!active || seconds <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active, seconds]);

  if (seconds <= 0) return null;

  const elapsed = (now - startedAt) / 1000;
  const remaining = Math.max(0, seconds - elapsed);
  const pct = Math.max(0, Math.min(1, remaining / seconds));
  const low = remaining < seconds * 0.25;

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-8 w-8">
        <svg viewBox="0 0 36 36" className="h-8 w-8 -rotate-90">
          <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke={low ? "#ff5bc8" : "#4dd8ff"}
            strokeWidth="3"
            strokeDasharray={2 * Math.PI * 16}
            strokeDashoffset={2 * Math.PI * 16 * (1 - pct)}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.2s linear" }}
          />
        </svg>
      </div>
      <span className={`font-mono text-sm font-bold ${low ? "text-neon-pink" : "text-white/70"}`}>
        {Math.ceil(remaining)}s
      </span>
    </div>
  );
}
