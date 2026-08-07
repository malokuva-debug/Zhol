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
    // WRAPPED IN RELATIVE DIV to anchor the hand properly
    <div className="relative w-full">
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

      {/* ✋ THE HAND HOLDING THE CARDS */}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 z-[100] pointer-events-none text-white/10 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
        <svg width="160" height="90" viewBox="0 0 160 90" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Base of the palm wrapping around */}
          <path d="M-10 90C5 45 45 35 80 55V90H-10Z" fill="currentColor" />
          {/* The Thumb clamping down on the center cards */}
          <path d="M70 90C70 50 85 20 110 15C130 11 140 25 130 50C123 68 105 90 105 90H70Z" fill="currentColor" />
          {/* Sleek highlight to make it pop like glass/neon */}
          <path d="M70 90C70 50 85 20 110 15" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
