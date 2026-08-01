"use client";

import { motion } from "framer-motion";
import type { CardId, Rank, Suit } from "@/lib/types";

const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RED_SUITS: Suit[] = ["H", "D"];

export function isJokerCard(id: CardId): boolean {
  return id.startsWith("JK");
}

export function parseCardId(id: CardId): { rank: Rank; suit: Suit } {
  const base = id.split("_")[0];
  return { rank: base.slice(0, -1) as Rank, suit: base.slice(-1) as Suit };
}

export default function PlayingCard({
  id,
  faceDown = false,
  selected = false,
  small = false,
  onClick,
  layoutId,
}: {
  id: CardId | null;
  faceDown?: boolean;
  selected?: boolean;
  small?: boolean;
  onClick?: () => void;
  layoutId?: string;
}) {
  const dims = small ? "h-16 w-11 text-[10px]" : "h-24 w-16 text-sm sm:h-28 sm:w-[4.5rem] sm:text-base";
  const isHidden = faceDown || !id || id === "__DRAWING__";

  // The Magic Flip: Face-up cards start rotated at 90deg (invisible edge) and flip to 0deg.
  // Hidden cards (like the deck and the dragging placeholder) skip the entrance animation.
  const motionProps = {
    layoutId,
    onClick,
    initial: isHidden ? undefined : { rotateY: -90, scale: 0.8, opacity: 0.5 },
    animate: { rotateY: 0, scale: 1, opacity: 1, y: selected ? -14 : 0 },
    whileHover: onClick ? { y: -8, scale: 1.04 } : undefined,
    whileTap: onClick ? { scale: 0.97 } : undefined,
    transition: { type: "spring", bounce: 0.4, duration: 0.5 },
  };

  if (isHidden) {
    return (
      <motion.div
        {...motionProps}
        className={`${dims} rounded-lg border border-neon-purple/40 bg-gradient-to-br from-[#2a1a55] to-[#150c33] shadow-lg`}
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(163,91,255,0.12) 0, rgba(163,91,255,0.12) 2px, transparent 2px, transparent 8px)",
        }}
      />
    );
  }

  if (isJokerCard(id)) {
    return (
      <motion.button
        {...motionProps}
        className={`${dims} relative flex flex-col items-center justify-center rounded-lg border bg-gradient-to-br from-[#ff5bc8] via-[#a35bff] to-[#4dd8ff] px-1.5 py-1 shadow-[0_4px_14px_rgba(0,0,0,0.4)] ${
          selected ? "border-white ring-2 ring-white/80" : "border-black/10"
        } ${onClick ? "cursor-pointer" : "cursor-default"}`}
      >
        <span className="text-xl leading-none sm:text-2xl">★</span>
        <span className="mt-1 font-black uppercase leading-none text-white/90">Joker</span>
      </motion.button>
    );
  }

  const { rank, suit } = parseCardId(id);
  const isRed = RED_SUITS.includes(suit);

  return (
    <motion.button
      {...motionProps}
      className={`${dims} relative flex flex-col justify-between rounded-lg border bg-gradient-to-br from-white to-slate-100 px-1.5 py-1 shadow-[0_4px_14px_rgba(0,0,0,0.4)] transition-shadow ${
        selected ? "border-neon-blue ring-2 ring-neon-blue/70" : "border-black/10"
      } ${isRed ? "text-red-600" : "text-slate-900"} ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      <span className="font-black leading-none">{rank}</span>
      <span className="self-center text-xl leading-none sm:text-2xl">{SUIT_SYMBOL[suit]}</span>
      <span className="self-end rotate-180 font-black leading-none">{rank}</span>
    </motion.button>
  );
}
