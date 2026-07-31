"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface DealTarget {
  seatIdx: number;
  nickname: string;
  isYou: boolean;
  finalCount: number; // 11 for the starter, 10 for everyone else
}

interface FlyingCard {
  key: string;
  seatIdx: number;
  x: string; // same percentage-of-container coordinate system as the seat labels
  y: string;
  delayMs: number;
}

/**
 * Purely a visual flourish — by the time this renders, the server has
 * already dealt the real hands. This just replays that deal on-screen in
 * the specified pattern (starter +3 / others +2 first, then everyone +2 per
 * round until the starter has 11 and everyone else has 10), then fades out
 * to reveal the already-rendered real table underneath.
 */
const SHUFFLE_MS = 550;

export default function DealAnimation({ targets, onComplete }: { targets: DealTarget[]; onComplete: () => void }) {
  const [visible, setVisible] = useState(true);
  const [phase, setPhase] = useState<"shuffle" | "dealing">("shuffle");
  const [dealtSoFar, setDealtSoFar] = useState<Record<number, number>>({});

  const positions = useMemo(() => computePositions(targets), [targets]);
  const flights = useMemo(() => buildFlightPlan(targets, positions), [targets, positions]);
  const totalDuration = SHUFFLE_MS + (flights.length ? flights[flights.length - 1].delayMs + 420 : 300);

  useEffect(() => {
    const counts: Record<number, number> = {};
    targets.forEach((t) => (counts[t.seatIdx] = 0));
    setDealtSoFar(counts);

    const shuffleTimer = setTimeout(() => setPhase("dealing"), SHUFFLE_MS);
    const timers = flights.map((f) =>
      setTimeout(() => {
        counts[f.seatIdx] = (counts[f.seatIdx] ?? 0) + 1;
        setDealtSoFar({ ...counts });
      }, SHUFFLE_MS + f.delayMs)
    );
    const endTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 250);
    }, totalDuration);

    return () => {
      clearTimeout(shuffleTimer);
      timers.forEach(clearTimeout);
      clearTimeout(endTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flights]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-30 overflow-hidden rounded-3xl bg-black/55 backdrop-blur-sm"
        >
          {targets.map((t) => {
            const pos = positions[t.seatIdx];
            const count = dealtSoFar[t.seatIdx] ?? 0;
            return (
              <div key={t.seatIdx} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: pos.x, top: pos.y }}>
                <div className="glass rounded-lg px-2.5 py-1 text-center text-xs font-bold text-white/90">
                  {t.isYou ? "You" : t.nickname} <span className="text-neon-blue-soft">{count}</span>
                </div>
              </div>
            );
          })}

          <motion.div
            className="absolute h-16 w-11 -translate-x-1/2 -translate-y-1/2 rounded border border-neon-purple/50 bg-gradient-to-br from-[#2a1a55] to-[#150c33]"
            style={{ left: "50%", top: "50%" }}
            animate={phase === "shuffle" ? { rotate: [0, -6, 6, -4, 4, 0], x: [0, -3, 3, -2, 2, 0] } : { rotate: 0, x: 0 }}
            transition={phase === "shuffle" ? { duration: SHUFFLE_MS / 1000, ease: "easeInOut" } : { duration: 0.15 }}
          />

          {phase === "dealing" &&
            flights.map((f) => (
              <motion.div
                key={f.key}
                className="absolute h-16 w-11 -translate-x-1/2 -translate-y-1/2 rounded border border-neon-purple/50 bg-gradient-to-br from-[#2a1a55] to-[#150c33] shadow-lg"
                initial={{ left: "50%", top: "50%", opacity: 0, scale: 0.8 }}
                animate={{ left: f.x, top: f.y, opacity: [0, 1, 1, 0], scale: 1 }}
                transition={{ duration: 0.4, delay: f.delayMs / 1000, ease: "easeOut" }}
              />
            ))}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs uppercase tracking-widest text-white/40">
            {phase === "shuffle" ? "Shuffling…" : "Dealing…"}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Opponents spread evenly across the top, you fixed at the bottom center. */
function computePositions(targets: DealTarget[]): Record<number, { x: string; y: string }> {
  const opponents = targets.filter((t) => !t.isYou);
  const you = targets.find((t) => t.isYou);
  const out: Record<number, { x: string; y: string }> = {};

  opponents.forEach((t, i) => {
    const pct = opponents.length === 1 ? 50 : 15 + (70 * i) / (opponents.length - 1);
    out[t.seatIdx] = { x: `${pct}%`, y: "16%" };
  });
  if (you) out[you.seatIdx] = { x: "50%", y: "86%" };
  return out;
}

function buildFlightPlan(targets: DealTarget[], positions: Record<number, { x: string; y: string }>): FlyingCard[] {
  if (targets.length === 0) return [];

  const starter = targets.find((t) => t.finalCount === 11) ?? targets[0];
  const bySeat = [...targets].sort((a, b) => a.seatIdx - b.seatIdx);
  const starterPos = bySeat.findIndex((t) => t.seatIdx === starter.seatIdx);
  const clockwise = [...bySeat.slice(starterPos), ...bySeat.slice(0, starterPos)];

  const dealt: Record<number, number> = {};
  clockwise.forEach((t) => (dealt[t.seatIdx] = 0));

  const totalCards = clockwise.reduce((sum, t) => sum + t.finalCount, 0);
  const stagger = Math.max(28, Math.min(85, 2400 / totalCards));

  const flights: FlyingCard[] = [];
  let tick = 0;
  const dealOne = (t: DealTarget) => {
    const p = positions[t.seatIdx];
    flights.push({
      key: `${t.seatIdx}:${dealt[t.seatIdx]}`,
      seatIdx: t.seatIdx,
      x: p.x,
      y: p.y,
      delayMs: tick * stagger,
    });
    dealt[t.seatIdx] += 1;
    tick += 1;
  };

  // Round 0: starter gets 3, everyone else gets 2
  clockwise.forEach((t) => {
    const count = t.seatIdx === starter.seatIdx ? 3 : 2;
    for (let i = 0; i < count; i++) dealOne(t);
  });
  // Subsequent rounds: everyone gets 2 more per round until they hit their final count
  while (clockwise.some((t) => dealt[t.seatIdx] < t.finalCount)) {
    clockwise.forEach((t) => {
      for (let i = 0; i < 2 && dealt[t.seatIdx] < t.finalCount; i++) dealOne(t);
    });
  }

  return flights;
}
