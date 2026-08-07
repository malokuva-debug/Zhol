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
    <div className="relative w-full">
      
      {/* 🖐️ BACK LAYER: The rest of the hand (Behind the cards) */}
      <div className="absolute -bottom-16 left-1/2 -translate-x-[45%] -z-10 pointer-events-none drop-shadow-md w-48 h-auto">
        <svg viewBox="220 900 200 550" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <g id="Hand-Back">
            <path id="Shape-1" fillRule="evenodd" fill="#ffca7e" d="m369.92 1444.62c0 0 34.1-235.01 34.69-248.71 0.6-13.71 14.9-92.96 28.61-144.21 13.7-51.25-101.9-115.01-117.4-106.67-15.49 8.35-71.5 45.29-75.67 85.81 0 0 32.77 56.02 35.15 85.22 2.39 29.2-13.7 70.91 10.13 93.55-22.04 127.52-63.16 184.13-63.16 184.13z"/>
            <path id="Shape-1-copy" fillRule="evenodd" fill="#ffca7e" stroke="#000000" strokeMiterlimit={100} d="m369.92 1444.62c0 0 34.1-235.01 34.69-248.71 0.6-13.71 14.9-92.96 28.61-144.21 13.7-51.25-101.9-115.01-117.4-106.67-15.49 8.35-71.5 45.29-75.67 85.81 0 0 32.77 56.02 35.15 85.22 2.39 29.2-13.7 70.91 10.13 93.55-22.04 127.52-63.16 184.13-63.16 184.13z"/>
            <path id="Shape-8" fillRule="evenodd" fill="none" stroke="#000000" strokeMiterlimit={100} d="m266.89 1069.14c0 0 20.93-10.3 23.18-15.13"/>
            <path id="Shape-19" fillRule="evenodd" fill="none" stroke="#000000" strokeMiterlimit={100} d="m259.32 992.56c0 0 44.7 73.38 42.49 90.48"/>
            <path id="Shape-20" fillRule="evenodd" fill="none" stroke="#000000" strokeMiterlimit={100} d="m354.78 1017.94l-4.42-21.52c0 0-8.82-14.35-19.86-13.8"/>
            <path id="Shape-9" fillRule="evenodd" fill="none" stroke="#000000" strokeMiterlimit={100} d="m248.22 1034.05c0 0 15.77-8.05 18.67-12.87"/>
            <path id="Shape-10" fillRule="evenodd" fill="none" stroke="#000000" strokeMiterlimit={100} d="m287.17 1030.83c0 0 11.27-3.86 13.85-9.01"/>
            <path id="Shape-11" fillRule="evenodd" fill="none" stroke="#000000" strokeMiterlimit={100} d="m374.1 1066.25c0 0 24.79 45.07 28.97 75.01"/>
            <path id="Shape-12" fillRule="evenodd" fill="none" stroke="#000000" strokeMiterlimit={100} d="m370.24 1049.51l39.59 41.21"/>
            <path id="Shape-13" fillRule="evenodd" fill="none" stroke="#000000" strokeMiterlimit={100} d="m371.52 1041.78c0 0 48.94 0.64 49.9-5.8"/>
            <path id="Shape-14" fillRule="evenodd" fill="none" stroke="#000000" strokeMiterlimit={100} d="m370.88 1034.38c0 0 29.62-13.2 45.72-9.34"/>
            <path id="Shape-15" fillRule="evenodd" fill="none" stroke="#000000" strokeMiterlimit={100} d="m355.75 1018.28c0 0 33.8-18.03 34.45-23.5"/>
            <path id="Shape-16" fillRule="evenodd" fill="none" stroke="#000000" strokeMiterlimit={100} d="m272.69 1109.07l22.85-18.35"/>
            <path id="Shape-17" fillRule="evenodd" fill="none" stroke="#000000" strokeMiterlimit={100} d="m279.77 1114.22l20.93-16.1"/>
            <path id="Shape-18" fillRule="evenodd" fill="none" stroke="#000000" strokeMiterlimit={100} d="m294.26 1218.85c0 0 21.89 0 28.65 2.9 6.76 2.89 26.72-5.15 26.72-5.15"/>
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

      {/* ✋ FRONT LAYER: The Thumb (In Front of the cards) */}
      <div className="absolute -bottom-16 left-1/2 -translate-x-[45%] z-[250] pointer-events-none drop-shadow-xl w-48 h-auto">
        <svg viewBox="220 900 200 550" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <g id="Thumb">
            <path id="Shape-2" fillRule="evenodd" fill="#ffca7e" d="m309.27 1039.19c0 0-45.29-72.11-32.77-101.9 12.51-29.8 36.35-11.32 43.5 12.51 7.15 23.84 14.97 56.63 31.66 71.53 16.68 14.9-42.39 17.86-42.39 17.86z"/>
            <path id="Shape-3" fillRule="evenodd" fill="none" stroke="#000000" strokeMiterlimit={100} d="m349.19 1019.52c0 0 18.48 16.69 19.07 32.78 0.6 16.08 45.89 103.09-1.19 151.35"/>
            <path id="Shape-21" fillRule="evenodd" fill="#ffffff" opacity={0.6} d="m288.38 958.23l-2.44-1.16-2.74-1.93-1.12-2.39-1.93-5.43-0.41-3.4 0.26-6.35c0 0 0.05-9.34 8.88-14.77 10.16-3.86 19.3 5.73 22.65 10.35l0.91 3.25 3.71 15.79-1.78-0.45-2.69-0.11-6.09 0.41-5.39 1.57-6.24 2.29z"/>
            <path id="Shape-4" fillRule="evenodd" fill="none" stroke="#000000" strokeMiterlimit={100} d="m275.9 974.23c0 0 16.68 34.57 33.37 62.57 0 0-1.19 35.16-6.56 44.1-5.36 8.94-1.78 45.29 2.98 50.05 4.77 4.77-16.08 45.89-16.08 45.89"/>
            <path id="Shape-5" fillRule="evenodd" fill="none" stroke="#000000" strokeMiterlimit={100} d="m305.69 987.94c0 0 13.11-9.54 25.03-7.15"/>
            <path id="Shape-6" fillRule="evenodd" fill="none" stroke="#000000" strokeMiterlimit={100} d="m309.87 1003.43c0 0 23.83 2.98 25.02-4.77"/>
            <path id="Shape-7" fillRule="evenodd" fill="none" stroke="#000000" strokeMiterlimit={100} d="m280.07 937.29c0 0-2.98 17.87 8.34 20.85 0 0 18.08-9.4 27.74-5.86l-4.51-19.32"/>
            <path id="Shape-23" fillRule="evenodd" fill="#ffca7e" stroke="#000000" strokeMiterlimit={100} d="m318.36 944.62c0 0 8.04 41.15 31.22 75.69"/>
          </g>
        </svg>
      </div>

    </div>
  );
}
