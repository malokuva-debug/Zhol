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

  // If it's your turn, you need 11 cards to discard one. If not, 10.
  const isMyTurn = gameState.turnIdx === gameState.yourSeat;
  const targetLength = isMyTurn ? 11 : 10;

  // We explicitly define the 11th card so you can discard exactly what is needed
  // to trigger the specific Zhol bonus.
  const CHEAT_HANDS = [
    {
      label: "Normal Zhol (-10 pts)",
      cards: ["10H", "10D", "10C", "10S", "JH", "JD", "JC", "QH", "QD", "QC"],
      extraCard: "2C" // Discarding a regular card
    },
    {
      label: "Joker Zhol (-20 pts)",
      cards: ["10H", "10D", "10C", "10S", "JH", "JD", "JC", "QH", "QD", "QC"],
      extraCard: "JK1" // Discarding a Joker
    },
    {
      label: "Suit Zhol (-25 pts)",
      cards: ["AS", "2S", "3S", "4S", "5S", "6S", "7S", "8S", "9S", "10S"],
      extraCard: "2C" // Discarding a regular card, leaving all Spades
    },
    {
      label: "Suit + Joker Zhol! (-50 pts)",
      cards: ["AS", "2S", "3S", "4S", "5S", "6S", "7S", "8S", "9S", "10S"],
      extraCard: "JK1" // Discarding a Joker, leaving all Spades
    }
  ];

  async function applyCheat(cheat: typeof CHEAT_HANDS[0]) {
    setBusy(true);
    const newHand = [...cheat.cards];
    
    // Append the specific extra card needed to pull off this Zhol
    if (targetLength === 11) newHand.push(cheat.extraCard);

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
          Select an instant-win hand. Once applied, drag the 11th card to the discard pile.
        </p>

        <div className="space-y-3">
          {CHEAT_HANDS.map((cheat, i) => (
            <button
              key={i}
              disabled={busy}
              onClick={() => applyCheat(cheat)}
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
