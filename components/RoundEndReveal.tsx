"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { ClientGameState, Room } from "@/lib/types";
import { makeCard } from "@/lib/gin-engine";
import PlayingCard from "./PlayingCard";

interface Props {
  room: Omit<Room, "passwordHash">;
  gameState: ClientGameState;
  isHost: boolean;
  onNextRound: () => void;
  onRestartMatch: () => void;
  onLeave: () => void;
}

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

function DeadwoodRow({ 
  name, 
  deadwood, 
  deadCards, 
  melds, 
  eliminated, 
  isWinner,
  isPishpirikGame,
  team 
}: { 
  name: string; 
  deadwood: number; 
  deadCards: string[]; 
  melds: any[]; 
  eliminated: boolean; 
  isWinner: boolean;
  isPishpirikGame?: boolean;
  team?: 1 | 2;
}) {
  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, scale: 0.5, x: 20 }, show: { opacity: 1, scale: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 20 } } };

  const showCards = isPishpirikGame ? deadCards.length > 0 : (!isWinner && deadCards.length > 0);
  const cardsLabel = isPishpirikGame ? "Captured Cards:" : "Deadwood:";

  return (
    <div className={`flex flex-col border p-4 rounded-xl mb-3 text-left ${isWinner ? "bg-emerald-900/20 border-emerald-500/30" : "bg-slate-800/80 border-slate-700"}`}>
      <div className="flex justify-between items-center mb-3 border-b border-white/10 pb-2">
        <span className="text-slate-200 font-bold text-lg flex items-center gap-2">
          {name} 
          {team === 1 && <span className="text-[10px] uppercase font-black tracking-wider bg-neon-blue/20 text-neon-blue-soft px-2 py-0.5 rounded">Team 1</span>}
          {team === 2 && <span className="text-[10px] uppercase font-black tracking-wider bg-neon-pink/20 text-neon-pink px-2 py-0.5 rounded">Team 2</span>}
          {eliminated && <span className="text-neon-pink text-[10px] uppercase font-black tracking-wider bg-neon-pink/10 px-2 py-1 rounded">Eliminated</span>}
        </span>
        
        {isWinner ? (
           <span className="font-black text-emerald-400 text-lg uppercase tracking-wide">
             {isPishpirikGame ? `${deadwood} pts (Round Winner)` : "Winner!"}
           </span>
        ) : (
           <span className="font-black text-red-400 text-xl">
             +{deadwood} pts
           </span>
        )}
      </div>
      
      <div className="flex flex-col gap-3">
        {melds && melds.length > 0 && (
          <div className="flex flex-wrap gap-4">
            {melds.map((meld, mIdx) => (
              <div key={mIdx} className="flex -space-x-4 bg-white/5 p-1.5 rounded-lg border border-white/10 shadow-inner">
                {(meld.cards || meld).map((id: string, cIdx: number) => (
                  <div key={cIdx} className="transform hover:-translate-y-1 transition-transform shadow-md">
                    <MiniCard cardId={id} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        
        {showCards && (
          <motion.div variants={container} initial="hidden" animate="show" className={`flex flex-wrap gap-2 mt-1 p-2 border rounded-lg ${isPishpirikGame ? 'bg-blue-900/20 border-blue-900/40' : 'bg-red-900/20 border-red-900/40'}`}>
            <span className={`w-full text-xs uppercase tracking-widest font-bold mb-1 ${isPishpirikGame ? 'text-blue-400' : 'text-red-400'}`}>{cardsLabel}</span>
            {deadCards.map((id, i) => (
              <motion.div key={`${id}-${i}`} variants={item}>
                <MiniCard cardId={id} />
              </motion.div>
            ))}
          </motion.div>
        )}

        {!isWinner && deadCards.length === 0 && !isPishpirikGame && (
          <div className="mt-1 flex items-center text-slate-500 italic text-sm">
            No deadwood
          </div>
        )}
      </div>
    </div>
  );
}

export default function RoundEndReveal({ room, gameState, isHost, onNextRound, onRestartMatch, onLeave }: Props) {
  const [phase, setPhase] = useState<"smash" | "counting">("smash");

  useEffect(() => {
    if (gameState.turnPhase === "round_over") {
      setPhase("smash");
      const t1 = setTimeout(() => setPhase("counting"), 2500); 
      return () => clearTimeout(t1);
    }
  }, [gameState.turnPhase]);

  if (gameState.turnPhase !== "round_over" || !gameState.lastRoundEnd) return null;

  const { type, winnerBonus, pointsBySeat } = gameState.lastRoundEnd;
  const isPishpirikGame = type === "PISHPIRIK";
  const is2v2 = room.rules.teamMode === "2v2";
  
  const ginLabel = 
    isPishpirikGame ? "PISHPIRIK!" : 
    type === "suit_joker_gin" ? "SUIT & JOKER ZHOL!" : 
    type === "suit_gin" ? "SUIT ZHOL!" : 
    type === "joker_gin" ? "JOKER ZHOL!" : 
    "ZHOL!";

  // -------------------------------------------------------------
  // ROW AGGREGATION LOGIC (INDIVIDUAL VS TEAMS)
  // -------------------------------------------------------------
  let displayRows: {
    key: string;
    name: string;
    deadwood: number;
    deadCards: string[];
    melds: any[];
    eliminated: boolean;
    isWinner: boolean;
    team?: 1 | 2;
  }[] = [];

  if (is2v2) {
    // Helper to merge teammates into a single row
    const buildTeamRow = (teamNum: 1 | 2) => {
      const teamPlayers = pointsBySeat.filter(p => room.seats[p.seatIdx]?.team === teamNum);
      if (teamPlayers.length === 0) return null;

      const names = teamPlayers.map(p => {
        const isMe = p.seatIdx === gameState.yourSeat;
        const opp = gameState.opponents.find(o => o.seatIdx === p.seatIdx);
        return isMe ? "You" : (opp?.nickname || room.seats[p.seatIdx]?.nickname || `Seat ${p.seatIdx + 1}`);
      }).join(" & ");

      return {
        key: `team-${teamNum}`,
        name: `${names} Team`, // <--- ADDED " Team" HERE
        deadwood: teamPlayers.reduce((sum, p) => sum + p.deadwood, 0), // Combine Scores
        deadCards: teamPlayers.flatMap(p => p.deadCards || []),        // Combine Cards
        melds: teamPlayers.flatMap(p => p.melds || []),                // Combine Melds
        eliminated: teamPlayers.some(p => p.eliminated),               
        isWinner: teamPlayers.some(p => p.seatIdx === gameState.lastRoundEnd!.winnerIdx),
        team: teamNum
      };
    };

    const t1 = buildTeamRow(1);
    const t2 = buildTeamRow(2);
    if (t1) displayRows.push(t1);
    if (t2) displayRows.push(t2);

  } else {
    // Normal Free-For-All
    displayRows = pointsBySeat.map((p) => {
      const opp = gameState.opponents.find(o => o.seatIdx === p.seatIdx);
      const isMe = p.seatIdx === gameState.yourSeat;
      const name = isMe ? "You" : (opp?.nickname || room.seats[p.seatIdx]?.nickname || `Seat ${p.seatIdx + 1}`);
      const isWinner = p.seatIdx === gameState.lastRoundEnd!.winnerIdx;
      const team = room.seats[p.seatIdx]?.team;

      return {
        key: `seat-${p.seatIdx}`,
        name,
        deadwood: p.deadwood,
        deadCards: p.deadCards || [],
        melds: p.melds || [],
        eliminated: p.eliminated,
        isWinner,
        team
      };
    });
  }

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

          {!isPishpirikGame && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="z-30 bg-black/60 p-6 rounded-2xl border border-white/10 backdrop-blur-md"
            >
              <h3 className="text-white font-bold mb-3 text-center uppercase tracking-widest text-sm text-neon-blue-soft">Winner's Hand</h3>
              <div className="flex flex-wrap gap-4 justify-center">
                {gameState.lastRoundEnd.winnerMelds?.map((meld: any, mIdx: number) => (
                  <div key={mIdx} className="flex -space-x-4 bg-white/5 p-2 rounded-xl border border-white/10">
                    {(meld.cards || meld).map((cardId: string, cIdx: number) => (
                       <div key={cIdx} className="transform hover:-translate-y-2 transition-transform shadow-lg">
                         <PlayingCard id={cardId} />
                       </div>
                    ))}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

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
        <motion.div 
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="bg-slate-900 border border-slate-700 p-6 md:p-8 rounded-2xl max-w-lg w-full text-center shadow-2xl mx-4 max-h-[90vh] overflow-y-auto"
        >
          <h2 className="text-3xl font-black text-[#a35bff] mb-1 italic">{ginLabel}</h2>
          {!isPishpirikGame && (
            <p className="text-slate-300 mb-6 font-medium">
              Winner Bonus: <span className="font-bold text-white bg-white/10 px-2 py-0.5 rounded">-{winnerBonus} pts</span>
            </p>
          )}
          
          <div className="space-y-4 mb-8 mt-4">
            {/* RENDER THE AGGREGATED DISPLAY ROWS */}
            {displayRows.map((row) => (
              <DeadwoodRow 
                key={row.key}
                name={row.name}
                deadwood={row.deadwood}
                deadCards={row.deadCards}
                melds={row.melds}
                eliminated={row.eliminated}
                isWinner={row.isWinner}
                isPishpirikGame={isPishpirikGame}
                team={row.team}
              />
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
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
              <div className="flex flex-col sm:flex-row gap-3">
                {isHost && (
                  <button 
                    onClick={onRestartMatch}
                    className="w-full py-3.5 bg-gradient-to-r from-neon-purple to-neon-pink hover:opacity-90 text-white font-bold text-lg rounded-xl transition shadow-[0_0_15px_rgba(255,91,200,0.4)] cursor-pointer"
                  >
                    Play Again
                  </button>
                )}
                <button 
                  onClick={onLeave}
                  className={`w-full py-3.5 bg-slate-800 border border-slate-600 hover:bg-slate-700 text-white font-bold text-lg rounded-xl transition cursor-pointer`}
                >
                  Back to Lobby
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
