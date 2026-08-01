"use client";

import { useState } from "react";

/**
 * Keeps the score visually de-emphasized during normal play (so the running
 * penalty tally isn't a constant, anxiety-inducing focal point), and reveals
 * it fully on hover. Also toggles on tap/touch since hover doesn't exist on
 * mobile.
 */
export default function ScoreBadge({ score, className }: { score: number; className?: string }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <span
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
      onTouchStart={() => setRevealed((r) => !r)}
      className={`cursor-default select-none font-black transition-all duration-150 ${
        revealed ? "opacity-100 blur-0" : "opacity-40 blur-[1.5px]"
      } ${className ?? ""}`}
    >
      {score}
    </span>
  );
}
