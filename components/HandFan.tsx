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
      
      {/* 🖐️ BACK LAYER: Folded fingers on the right side of the deck */}
      <div className="absolute -bottom-16 left-1/2 -translate-x-[45%] -z-10 pointer-events-none drop-shadow-md">
        <svg width="240" height="340" viewBox="0 0 240 340" fill="none" xmlns="http://www.w3.org/2000/svg">
          <g stroke="#F4CA9E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="#FCE1C6">
            {/* Index Finger */}
            <path d="M 120 130 C 180 120, 190 170, 140 180" />
            {/* Middle Finger */}
            <path d="M 125 165 C 195 155, 205 205, 145 215" />
            {/* Ring Finger */}
            <path d="M 130 200 C 200 190, 210 240, 145 250" />
            {/* Pinky Finger */}
            <path d="M 130 235 C 190 225, 200 275, 140 285" />
            
            {/* Right Wrist Base Connection */}
            <path d="M 135 270 C 150 280, 150 310, 140 340 L 100 340 Z" stroke="none" />
            <path d="M 135 270 C 150 280, 150 310, 140 340" fill="none" />
          </g>
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

      {/* ✋ FRONT LAYER: Thumb, Palm, and Left Wrist */}
      <div className="absolute -bottom-16 left-1/2 -translate-x-[45%] z-[250] pointer-events-none drop-shadow-xl">
        <svg width="240" height="340" viewBox="0 0 240 340" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Main Hand Base Outline & Fill */}
          <path d="M 70 340 L 65 220 C 50 160, 50 130, 75 100 C 85 80, 90 40, 110 35 C 130 30, 135 55, 120 85 C 115 100, 115 130, 115 150 L 135 200 L 130 340 Z" fill="#FCE1C6" />
          <path d="M 70 340 L 65 220 C 50 160, 50 130, 75 100 C 85 80, 90 40, 110 35 C 130 30, 135 55, 120 85 C 115 100, 115 130, 115 150 L 135 200 L 130 340" stroke="#F4CA9E" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          
          {/* Palm Life Line Crease */}
          <path d="M 115 150 C 95 190, 90 240, 100 290" stroke="#F4CA9E" strokeWidth="3" strokeLinecap="round" fill="none"/>
          
          {/* Thumb Knuckle Crease */}
          <path d="M 90 95 Q 115 85 125 110" stroke="#F4CA9E" strokeWidth="3" strokeLinecap="round" fill="none"/>
          
          {/* Flat Stylized Nail */}
          <path d="M 110 38 C 105 32, 115 28, 122 30 C 130 32, 130 45, 120 45 Z" fill="#FFFFFF" stroke="#F4CA9E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          
          {/* Lower Thumb Joint Crease */}
          <path d="M 95 130 Q 115 125 125 140" stroke="#F4CA9E" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        </svg>
      </div>

    </div>
  );
}
