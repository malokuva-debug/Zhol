// components/CheatManager.tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { ClientGameState } from "@/lib/types";

interface Props {
  roomCode: string;
  clientId: string;
  gameState: ClientGameState;
  onClose: () => void;
}

export default function CheatManager({ roomCode, clientId, gameState, onClose }: Props) {
  const [busy, setBusy] = useState(false);

  const isMyTurn = gameState.turnIdx === gameState.yourSeat;
  const targetLength = isMyTurn ? 11 : 10;
  
  const extraCard = "2C"; 

  const CHEAT_HANDS = [
    {
      label: "Normal Zhol (4x10, 3xJ, 3xQ)",
      cards: ["10H", "10D", "10C", "10S", "JH", "JD", "JC", "QH", "QD", "QC"]
    },
    {
      label: "Suit Zhol (Hearts Run)",
      cards: ["AH", "2H", "3H", "4H", "5H", "6H", "7H", "8H", "9H", "10H"]
    },
    {
      label: "Suit + Joker Zhol! (50pts)",
      cards: ["AS", "2S", "3S", "4S", "5S", "6S", "7S", "8S", "JK1", "JK2"]
    }
  ];

  async function applyCheat(baseCards: string[]) {
    setBusy(true);
    const newHand = [...baseCards];
    if (targetLength === 11) newHand.push(extraCard);

    try {
      await fetch(`/api/rooms/${roomCode}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cheat_set_hand",
          clientId,
          newHand
        }),
      });
      onClose();
    } catch (e) {
      console.error("Cheat failed:", e);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-neon-pink p-6 rounded-2xl shadow-[0_0_50px_rgba(255,20,147,0.4)] w-full max-w-sm text-center"
      >
        <div className="flex items-center justify-center mb-4 text-neon-pink">
          <svg className="w-8 h-8 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
          <h2 className="text-2xl font-black italic tracking-wider">SECRET OVERRIDE</h2>
        </div>
        
        <p className="text-sm text-slate-300 mb-6 font-medium">
          Select an instant-win hand. Your current hand will be completely replaced.
        </p>

        <div className="space-y-3">
          {CHEAT_HANDS.map((cheat, i) => (
            <button
              key={i}
              disabled={busy}
              onClick={() => applyCheat(cheat.cards)}
              className="w-full py-3 px-4 bg-slate-800 hover:bg-neon-pink/20 border border-slate-700 hover:border-neon-pink text-white font-bold rounded-xl transition text-left flex justify-between items-center"
            >
              <span>{cheat.label}</span>
              <span className="text-xs text-slate-400">Apply</span>
            </button>
          ))}
        </div>

        <button 
          onClick={onClose}
          className="mt-6 text-sm text-slate-400 hover:text-white transition"
        >
          Close Manager
        </button>
      </motion.div>
    </div>
  );
}
