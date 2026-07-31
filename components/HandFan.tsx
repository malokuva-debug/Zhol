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
  insertAtX, // NEW PROP: X-coordinate of where the card was dropped
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

      // If we have an X coordinate for the drop, estimate where it goes in the hand
      if (insertAtX !== undefined && insertAtX !== null) {
        const screenWidth = window.innerWidth;
        // Hand fan takes up roughly the middle 80% of the screen
        const startX = screenWidth * 0.1; 
        const endX = screenWidth * 0.9;
        
        let pct = (insertAtX - startX) / (endX - startX);
        pct = Math.max(0, Math.min(1, pct)); // clamp between 0 and 1
        
        const targetIndex = Math.floor(pct * (stillHere.length + 1));
        
        const newOrder = [...stillHere];
        newOrder.splice(targetIndex, 0, ...added);
        return newOrder;
      }

      // Default: just put it at the end
      return [...stillHere, ...added];
    });
  }, [cards, insertAtX]);

  const n = order.length;
  const center = (n - 1) / 2;
  const angleStep = n > 1 ? Math.min(6, 60 / n) : 0;
  const overlapPx = n > 9 ? 34 : 30;

  return (
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
  );
}
