"use client";

import { useEffect, useState } from "react";
import { Reorder, PanInfo } from "framer-motion";
import PlayingCard from "./PlayingCard";
import type { CardId } from "@/lib/types";

const MELD_RING_COLORS = [
  "ring-2 ring-neon-blue/70",
  "ring-2 ring-neon-purple/70",
  "ring-2 ring-emerald-400/70",
  "ring-2 ring-amber-400/70",
];

export default function HandFan({
  cards,
  selectedCard,
  onSelect,
  interactive,
  meldIndexByCard,
  onDragEnd,
  insertAtX,
}: {
  cards: CardId[];
  selectedCard: string | null;
  onSelect: (id: string) => void;
  interactive: boolean;
  meldIndexByCard?: Record<string, number>;
  onDragEnd?: (id: string, info: PanInfo) => void;
  insertAtX?: number | null; 
}) {
  const [order, setOrder] = useState<CardId[]>(cards);

  useEffect(() => {
    setOrder((prev) => {
      const stillHere = prev.filter((id) => cards.includes(id));
      const added = cards.filter((id) => !prev.includes(id));

      if (added.length === 0) return stillHere;

      if (insertAtX !== undefined && insertAtX !== null) {
        const screenWidth = window.innerWidth;
        const startX = screenWidth * 0.1; 
        const endX = screenWidth * 0.9;
        
        let pct = (insertAtX - startX) / (endX - startX);
        pct = Math.max(0, Math.min(1, pct)); 
        
        const targetIndex = Math.floor(pct * (stillHere.length + 1));
        
        const newOrder = [...stillHere];
        newOrder.splice(targetIndex, 0, ...added);
        return newOrder;
      }

      return [...stillHere, ...added];
    });
  }, [cards, insertAtX]);

  const n = order.length;
  const center = (n - 1) / 2;
  const angleStep = n > 1 ? Math.min(6, 60 / n) : 0;
  const overlapPx = n > 9 ? 34 : 30;

  return (
    <div className="relative w-full">
      
      {/* 🖐️ 3D BACK FINGERS (BEHIND THE CARDS) */}
      <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 -z-10 pointer-events-none drop-shadow-[0_15px_15px_rgba(0,0,0,0.8)]">
        <svg width="400" height="200" viewBox="0 0 400 200" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="fingerGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#b3763c"/>
              <stop offset="40%" stopColor="#e2ad76"/>
              <stop offset="85%" stopColor="#d49a59"/>
              <stop offset="100%" stopColor="#965a25"/>
            </linearGradient>
            <linearGradient id="creaseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8a4f1c"/>
              <stop offset="100%" stopColor="#e2ad76" stopOpacity="0"/>
            </linearGradient>
          </defs>

          {/* Pinky */}
          <path d="M 70 200 C 50 120, 80 80, 100 80 C 120 80, 120 120, 110 200" fill="url(#fingerGrad)"/>
          <path d="M 80 110 Q 100 120 115 110" stroke="url(#creaseGrad)" strokeWidth="3" fill="none" strokeLinecap="round"/>
          <path d="M 75 140 Q 100 150 112 140" stroke="url(#creaseGrad)" strokeWidth="3" fill="none" strokeLinecap="round"/>
          
          {/* Ring Finger */}
          <path d="M 125 200 C 115 80, 150 40, 175 40 C 200 40, 205 80, 185 200" fill="url(#fingerGrad)"/>
          <path d="M 140 80 Q 165 95 185 80" stroke="url(#creaseGrad)" strokeWidth="3" fill="none" strokeLinecap="round"/>
          <path d="M 135 120 Q 165 135 180 120" stroke="url(#creaseGrad)" strokeWidth="3" fill="none" strokeLinecap="round"/>

          {/* Middle Finger */}
          <path d="M 200 200 C 195 60, 230 20, 260 20 C 290 20, 290 60, 270 200" fill="url(#fingerGrad)"/>
          <path d="M 215 70 Q 245 85 270 70" stroke="url(#creaseGrad)" strokeWidth="3" fill="none" strokeLinecap="round"/>
          <path d="M 210 110 Q 245 125 265 110" stroke="url(#creaseGrad)" strokeWidth="3" fill="none" strokeLinecap="round"/>

          {/* Index Finger */}
          <path d="M 285 200 C 290 80, 330 40, 360 40 C 390 40, 370 80, 345 200" fill="url(#fingerGrad)"/>
          <path d="M 310 80 Q 335 95 365 80" stroke="url(#creaseGrad)" strokeWidth="3" fill="none" strokeLinecap="round"/>
          <path d="M 305 120 Q 335 135 355 120" stroke="url(#creaseGrad)" strokeWidth="3" fill="none" strokeLinecap="round"/>
        </svg>
      </div>

      {/* 🃏 THE CARDS */}
      <Reorder.Group
        axis="x"
        values={order}
        onReorder={setOrder}
        className="flex items-end justify-center px-4 py-3"
        style={{ listStyle: "none" }}
      >
        {order.map((id, i) => {
          const offset = i - center;
          const rotate = offset * angleStep;
          const isSelected = selectedCard === id;
          const meldIdx = meldIndexByCard?.[id];
          const ringClass = meldIdx !== undefined ? MELD_RING_COLORS[meldIdx % MELD_RING_COLORS.length] : "";

          return (
            <Reorder.Item
              key={id}
              value={id}
              drag={interactive ? true : "x"}
              onDragEnd={(e, info) => {
                if (interactive && onDragEnd) onDragEnd(id, info);
              }}
              style={{
                marginLeft: i === 0 ? 0 : -overlapPx,
                zIndex: isSelected ? 100 : i,
              }}
              whileDrag={{ scale: 1.08, zIndex: 200 }}
              className="cursor-grab touch-none active:cursor-grabbing"
            >
              <div
                style={{
                  transform: `rotate(${rotate}deg) translateY(${isSelected ? -20 : 0}px)`,
                  transformOrigin: "bottom center",
                  transition: "transform 0.18s ease",
                }}
              >
                <div className={`rounded-lg ${ringClass}`}>
                  <PlayingCard 
                    id={id} 
                    selected={isSelected} 
                    onClick={interactive ? () => onSelect(id) : undefined} 
                    layoutId={`card-${id}`} 
                  />
                </div>
              </div>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>

      {/* ✋ 3D THUMB (IN FRONT OF THE CARDS) */}
      {/* z-[250] ensures it stays in front even while dragging a card (z-200) */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-[40%] z-[250] pointer-events-none drop-shadow-[0_15px_25px_rgba(0,0,0,0.7)]">
        <svg width="220" height="180" viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="thumbTip" cx="40%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#f5c796"/>
              <stop offset="70%" stopColor="#d49455"/>
              <stop offset="100%" stopColor="#a36324"/>
            </radialGradient>
            <linearGradient id="palmGrad" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#b3763c"/>
              <stop offset="100%" stopColor="#e2ad76"/>
            </linearGradient>
            <linearGradient id="nailGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffeadd"/>
              <stop offset="100%" stopColor="#e6ab91"/>
            </linearGradient>
            <filter id="thumbShadow">
              <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#000" floodOpacity="0.4"/>
            </filter>
          </defs>
          
          {/* Base Palm */}
          <path d="M -20 180 C 20 80, 80 70, 110 70 C 150 70, 160 120, 180 180 Z" fill="url(#palmGrad)"/>
          
          {/* Thumb curling over with built-in SVG drop shadow */}
          <path d="M 160 180 C 170 120, 160 80, 140 40 C 120 0, 80 10, 70 40 C 60 70, 80 110, 110 180 Z" fill="url(#thumbTip)" filter="url(#thumbShadow)"/>
          
          {/* Deep Knuckle Creases */}
          <path d="M 90 90 Q 110 80 130 95" stroke="#965a25" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          <path d="M 85 105 Q 110 95 125 110" stroke="#965a25" strokeWidth="2" fill="none" strokeLinecap="round"/>
          
          {/* Glossy Thumbnail */}
          <path d="M 80 40 C 75 25, 85 10, 100 15 C 115 20, 115 35, 110 45 C 100 50, 85 50, 80 40 Z" fill="url(#nailGrad)"/>
          
          {/* Specular White Highlight on the Nail */}
          <path d="M 85 30 C 85 20, 95 15, 100 18" stroke="#ffffff" strokeWidth="2.5" strokeOpacity="0.75" fill="none" strokeLinecap="round"/>
        </svg>
      </div>

    </div>
  );
}
