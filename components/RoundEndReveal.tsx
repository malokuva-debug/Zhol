"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import PlayingCard from "./PlayingCard";
import { cardValue, isJokerId, JOKER_DEADWOOD_VALUE } from "@/lib/gin-engine";
import type { Rank, Room, RoundEndInfo } from "@/lib/types";

const GIN_LABEL: Record<string, string> = {
  normal_gin: "Gin",
  joker_gin: "Joker Gin",
  suit_gin: "Suit Gin",
  suit_joker_gin: "Suit + Joker Gin",
};

function pointValueOf(id: string): number {
  if (isJokerId(id)) return JOKER_DEADWOOD_VALUE;
  const base = id.split("_")[0];
  return cardValue(base.slice(0, -1) as Rank);
}

export default function RoundEndReveal({
  info,
  room,
  roundKey,
}: {
  info: RoundEndInfo;
  room: Omit<Room, "passwordHash">;
  roundKey: number;
}) {
  const winner = room.seats[info.winnerIdx]?.nickname ?? "?";

  return (
    <motion.div
      key={roundKey}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="glass glow-purple absolute inset-x-4 top-4 z-20 max-h-[85%] overflow-y-auto rounded-xl p-4 text-center"
    >
      {/* Winner celebration */}
      <motion.div
        initial={{ scale: 0.5, rotate: -4 }}
        animate={{ scale: [0.5, 1.2, 1], rotate: [-4, 3, 0] }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        className="text-xl font-black text-glow-purple"
      >
        ✨ {winner} · {GIN_LABEL[info.type] ?? info.type}! ✨
      </motion.div>
      <div className="mt-1 text-xs text-neon-blue-soft">{winner}: -{info.winnerBonus} pts</div>

      {info.winnerMelds.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-1">
          {info.winnerMelds.flatMap((m) => m.cards).map((id, i) => (
            <motion.div
              key={id + i}
              initial={{ opacity: 0, y: 10, scale: 0.7 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.05 * i + 0.3, type: "spring", bounce: 0.5 }}
              className="rounded ring-1 ring-yellow-300/60"
            >
              <PlayingCard id={id} small />
            </motion.div>
          ))}
        </div>
      )}

      {/* Loser deadwood tallies */}
      <div className="mt-4 space-y-3 border-t border-white/10 pt-3">
        {info.pointsBySeat.map((p) => (
          <LoserTally
            key={p.seatIdx}
            nickname={room.seats[p.seatIdx]?.nickname ?? "?"}
            deadCards={p.deadCards}
            total={p.deadwood}
            eliminated={p.eliminated}
          />
        ))}
      </div>
    </motion.div>
  );
}

function LoserTally({
  nickname,
  deadCards,
  total,
  eliminated,
}: {
  nickname: string;
  deadCards: string[];
  total: number;
  eliminated: boolean;
}) {
  const [runningTotal, setRunningTotal] = useState(0);

  useEffect(() => {
    setRunningTotal(0);
    if (deadCards.length === 0) {
      setRunningTotal(total);
      return;
    }
    const timers = deadCards.map((id, i) =>
      setTimeout(() => setRunningTotal((t) => t + pointValueOf(id)), 240 * (i + 1))
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadCards.join(","), total]);

  return (
    <div className="text-xs">
      <div className="mb-1.5 font-semibold text-white/70">
        {nickname} {eliminated && <span className="text-neon-pink">— eliminated</span>}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {deadCards.length === 0 && <span className="text-white/40">no deadwood</span>}
        {deadCards.map((id, i) => (
          <motion.div
            key={id + i}
            initial={{ opacity: 0, y: -12, scale: 0.6 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.24 * (i + 1), type: "spring", bounce: 0.5 }}
            className="relative"
          >
            <PlayingCard id={id} small />
            <span className="absolute -right-1 -top-2 rounded-full bg-neon-pink px-1 text-[9px] font-bold text-white">
              +{pointValueOf(id)}
            </span>
          </motion.div>
        ))}
        <motion.span key={runningTotal} initial={{ scale: 1.35 }} animate={{ scale: 1 }} className="ml-2 font-black text-white">
          = {runningTotal}
        </motion.span>
      </div>
    </div>
  );
}
