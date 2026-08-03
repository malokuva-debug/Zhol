"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { ClientGameState } from "@/lib/types";

interface Props {
  gameState: ClientGameState;
  onNextRound: () => void;
}

export default function RoundEndReveal({ gameState, onNextRound }: Props) {
  // 'smash' plays the impact animation, 'counting' shows the deadwood tally
  const [phase, setPhase] = useState<"smash" | "counting">("smash");

  useEffect(() => {
    if (gameState.turnPhase === "round_over") {
      setPhase("smash");
      const t = setTimeout(() => setPhase("counting"), 2500); // Wait 2.5s for smash sequence
      return () => clearTimeout(t);
    }
  }, [gameState.turnPhase]);

  if (gameState.turnPhase !== "round_over" || !gameState.lastRoundEnd) return null;

  const { type, winnerBonus, pointsBySeat } = gameState.lastRoundEnd;
  
  // Format the visual label based on the specific Zhol achieved
  const ginLabel = 
    type === "suit_joker_gin" ? "SUIT & JOKER ZHOL!" : 
    type === "suit_gin" ? "SUIT ZHOL!" : 
    type === "joker_gin" ? "JOKER ZHOL!" : 
    "ZHOL!";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      
      {phase === "smash" ? (
        <div className="relative flex items-center justify-center w-full h-full overflow-hidden">
          {/* 1. The Slamming Text */}
          <motion.div
            initial={{ scale: 4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="absolute z-20 text-6xl md:text-8xl font-black text-white italic tracking-tighter text-center"
            style={{ textShadow: "0 0 30px #a35bff, 0 0 60px #a35bff" }}
          >
            {ginLabel}
          </motion.div>

          {/* 2. The Scattered Cards (Force of the Gin) */}
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
              animate={{ 
                x: (Math.random() - 0.5) * 1500, 
                y: (Math.random() - 0.5) * 1500, 
                rotate: (Math.random() - 0.5) * 720,
                opacity: 0,
                scale: 0.5
              }}
              transition={{ duration: 1.2, ease: "easeOut", delay: 0.1 }}
              className="absolute z-10 w-24 h-36 bg-white rounded-lg border-2 border-slate-300 shadow-2xl"
            >
              {/* Fake card back pattern */}
              <div className="w-full h-full border-[6px] border-white bg-blue-600 rounded-sm opacity-50" />
            </motion.div>
          ))}
        </div>
      ) : (
        /* 3. The Deadwood Counting Panel */
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900 border border-slate-700 p-8 rounded-2xl max-w-lg w-full text-center shadow-2xl"
        >
          <h2 className="text-3xl font-bold text-[#a35bff] mb-2">{ginLabel}</h2>
          <p className="text-slate-300 mb-6">
            Winner Bonus: <span className="font-bold text-white">-{winnerBonus}</span> points
          </p>
          
          <div className="space-y-3 mb-8">
            {pointsBySeat.map((p) => {
              const opp = gameState.opponents.find(o => o.seatIdx === p.seatIdx);
              const isMe = p.seatIdx === gameState.yourSeat;
              const name = isMe ? "You" : opp?.nickname || `Seat ${p.seatIdx + 1}`;

              return (
                <div key={p.seatIdx} className="flex justify-between items-center bg-slate-800 p-4 rounded-lg">
                  <span className="text-slate-200 font-medium">
                    {name} {p.eliminated && <span className="text-red-500 text-sm ml-2">(Eliminated)</span>}
                  </span>
                  <span className={`font-bold ${p.deadwood > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {p.deadwood > 0 ? `+${p.deadwood} Deadwood` : "Winner!"}
                  </span>
                </div>
              );
            })}
          </div>

          {!gameState.matchOver && (
            <button 
              onClick={onNextRound}
              className="w-full py-3 bg-gradient-to-r from-neon-blue to-neon-purple hover:opacity-90 text-black font-bold rounded-xl transition"
            >
              Start Next Round
            </button>
          )}
          
          {gameState.matchOver && (
            <div className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-[0_0_15px_rgba(5,150,105,0.5)]">
              Match Finished!
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
