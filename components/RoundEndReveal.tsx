"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { ClientGameState } from "@/lib/types";
import { makeCard } from "@/lib/gin-engine";

interface Props {
  gameState: ClientGameState;
  onNextRound: () => void;
  onLeave: () => void;
}

// 🃏 Helper to visually render the actual deadwood cards
function MiniCard({ cardId }: { cardId: string }) {
  const card = makeCard(cardId);
  const isRed = card.suit === "H" || card.suit === "D";
  const suitSymbol = 
    card.suit === "H" ? "♥" : 
    card.suit === "D" ? "♦" : 
    card.suit === "C" ? "♣" : 
    card.suit === "S" ? "♠" : "";

  return (
    <div className={`flex flex-col items-center justify-center w-12 h-16 bg-white rounded shadow-md border border-slate-300 ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
      {card.isJoker ? (
        <span className="text-[10px] font-black rotate-90 text-[#a35bff] tracking-widest">JOKER</span>
      ) : (
        <>
          <span className="text-sm font-black leading-none">{card.rank}</span>
          <span className="text-lg leading-none">{suitSymbol}</span>
        </>
      )}
    </div>
  );
}

// 🧮 Individual row for counting a player's deadwood
function DeadwoodRow({ 
  name, 
  deadwood, 
  deadCards, 
  eliminated, 
  isWinner 
}: { 
  name: string; 
  deadwood: number; 
  deadCards: string[]; 
  eliminated: boolean; 
  isWinner: boolean;
}) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.15 } // Count cards one by one (0.15s gap)
    }
  };

  const item = {
    hidden: { opacity: 0, scale: 0.5, x: 20 },
    show: { opacity: 1, scale: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 20 } }
  };

  return (
    <div className="flex flex-col bg-slate-800/80 border border-slate-700 p-4 rounded-xl mb-3 text-left">
      <div className="flex justify-between items-center mb-2">
        <span className="text-slate-200 font-semibold text-lg">
          {name} 
          {eliminated && <span className="text-neon-pink text-[10px] uppercase font-bold tracking-wider ml-2 bg-neon-pink/10 px-2 py-1 rounded">Eliminated</span>}
        </span>
        
        {isWinner ? (
           <motion.span 
             initial={{ opacity: 0, scale: 0.5 }} 
             animate={{ opacity: 1, scale: 1 }} 
             transition={{ delay: 0.5 }}
             className="font-black text-emerald-400 text-lg uppercase tracking-wide"
           >
             Winner!
           </motion.span>
        ) : (
           <motion.span 
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             // Reveal the total score exactly after all cards finish popping in
             transition={{ delay: deadCards.length * 0.15 + 0.3 }}
             className="font-black text-red-400 text-xl"
           >
             +{deadwood} pts
           </motion.span>
        )}
      </div>
      
      {!isWinner && deadCards.length > 0 && (
        <motion.div 
          variants={container}
          initial="hidden"
          animate="show"
          className="flex flex-wrap gap-2 mt-1 min-h-[4rem]" // min-h prevents layout jumps while counting
        >
          {deadCards.map((id, i) => (
            <motion.div key={`${id}-${i}`} variants={item}>
              <MiniCard cardId={id} />
            </motion.div>
          ))}
        </motion.div>
      )}
      
      {!isWinner && deadCards.length === 0 && (
        <div className="mt-1 min-h-[4rem] flex items-center text-slate-500 italic text-sm">
          No deadwood
        </div>
      )}
    </div>
  );
}

export default function RoundEndReveal({ gameState, onNextRound, onLeave }: Props) {
  // 'smash' plays the impact animation, 'counting' shows the deadwood tally
  const [phase, setPhase] = useState<"smash" | "counting">("smash");

  useEffect(() => {
    if (gameState.turnPhase === "round_over") {
      setPhase("smash");
      
      // Transition from Smash to Counting after 2.5 seconds
      const t1 = setTimeout(() => setPhase("counting"), 2500); 
      return () => clearTimeout(t1);
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md">
      
      {phase === "smash" ? (
        <div className="relative flex flex-col items-center justify-center w-full h-full overflow-hidden">
          <motion.div
            initial={{ scale: 4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="z-20 text-6xl md:text-8xl font-black text-white italic tracking-tighter text-center mb-8"
            style={{ textShadow: "0 0 30px #a35bff, 0 0 60px #a35bff" }}
          >
            {ginLabel}
          </motion.div>

          {/* NEW: Winner's Hand Display */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="z-30 bg-black/60 p-6 rounded-2xl border border-white/10 backdrop-blur-md"
          >
            <h3 className="text-white font-bold mb-3 text-center uppercase tracking-widest text-sm text-neon-blue-soft">Winner's Hand</h3>
            <div className="flex flex-wrap gap-4 justify-center">
              {gameState.lastRoundEnd.winnerMelds?.map((meld, mIdx) => (
                <div key={mIdx} className="flex -space-x-4 bg-white/5 p-2 rounded-xl border border-white/10">
                  {meld.map((cardId, cIdx) => (
                     <div key={cIdx} className="transform hover:-translate-y-2 transition-transform shadow-lg">
                       <PlayingCard id={cardId} />
                     </div>
                  ))}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Background Scattered Cards (Force of the Gin) */}
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
              className="absolute z-10 w-24 h-36 bg-white rounded-lg border-2 border-slate-300 shadow-2xl pointer-events-none"
            >
              <div className="w-full h-full border-[6px] border-white bg-blue-600 rounded-sm opacity-50" />
            </motion.div>
          ))}
        </div>
      ) : (
        /* 3. The Deadwood Counting Panel */
        <motion.div 
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="bg-slate-900 border border-slate-700 p-6 md:p-8 rounded-2xl max-w-lg w-full text-center shadow-2xl mx-4"
        >
          <h2 className="text-3xl font-black text-[#a35bff] mb-1 italic">{ginLabel}</h2>
          <p className="text-slate-300 mb-6 font-medium">
            Winner Bonus: <span className="font-bold text-white bg-white/10 px-2 py-0.5 rounded">-{winnerBonus} pts</span>
          </p>
          
          <div className="space-y-4 mb-8">
            {pointsBySeat.map((p) => {
              const opp = gameState.opponents.find(o => o.seatIdx === p.seatIdx);
              const isMe = p.seatIdx === gameState.yourSeat;
              const name = isMe ? "You" : opp?.nickname || `Seat ${p.seatIdx + 1}`;
              const isWinner = p.seatIdx === gameState.lastRoundEnd!.winnerIdx;

              return (
                <DeadwoodRow 
                  key={p.seatIdx}
                  name={name}
                  deadwood={p.deadwood}
                  deadCards={p.deadCards || []}
                  eliminated={p.eliminated}
                  isWinner={isWinner}
                />
              );
            })}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }} // FIX: Make button instantly visible and clickable
            className="w-full"
          >
            {!gameState.matchOver ? (
              <button 
                onClick={onNextRound}
                className="w-full py-3.5 bg-gradient-to-r from-neon-blue to-neon-purple hover:opacity-90 text-black font-bold text-lg rounded-xl transition shadow-[0_0_15px_rgba(163,91,255,0.3)] cursor-pointer"
              >
                Start Next Round
              </button>
            ) : (
              <button 
                onClick={onLeave}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-lg rounded-xl transition shadow-[0_0_15px_rgba(5,150,105,0.5)] cursor-pointer"
              >
                Match Finished - Return to Lobby
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
