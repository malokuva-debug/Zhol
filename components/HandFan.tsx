"use client";

import { useEffect, useState } from "react";
import { Reorder } from "framer-motion";
import PlayingCard from "./PlayingCard";
import type { CardId } from "@/lib/types";

const MELD_RING_COLORS = [
  "ring-2 ring-neon-blue/70",
  "ring-2 ring-neon-purple/70",
  "ring-2 ring-emerald-400/70",
  "ring-2 ring-amber-400/70",
];

/**
 * Renders the player's hand as a held card-fan: same baseline for every
 * card (no vertical staggering), horizontal overlap, a slight rotation per
 * card, and z-index strictly increasing left-to-right (leftmost card sits
 * behind, each next card stacks above the previous, rightmost is on top) —
 * never alternating. Drag-reorders to sort, purely a local display
 * preference that never touches game state. Cards belonging to the same
 * meld (per `meldIndexByCard`) get a matching colored ring so the player can
 * see their groupings at a glance.
 */
export default function HandFan({
  cards,
  selectedCard,
  onSelect,
  interactive,
  meldIndexByCard,
  onDragEnd,
}: {
  cards: CardId[];
  selectedCard: string | null;
  onSelect: (id: string) => void;
  interactive: boolean;
  meldIndexByCard?: Record<string, number>;
  onDragEnd?: (id: string, info: PanInfo) => void;
}) {
  const [order, setOrder] = useState<CardId[]>(cards);

  useEffect(() => {
    setOrder((prev) => {
      const stillHere = prev.filter((id) => cards.includes(id));
      const added = cards.filter((id) => !prev.includes(id));
      return [...stillHere, ...added];
    });
  }, [cards]);

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
            drag={interactive ? true : "x"} // Override to allow 2D dragging out of the fan
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
            {/* Fan rotation lives here, isolated from Reorder's own drag transform.
                Same vertical baseline for every card — only rotation + a fixed
                lift-on-select, no per-position vertical staggering. */}
            <div
              style={{
                transform: `rotate(${rotate}deg) translateY(${isSelected ? -20 : 0}px)`,
                transformOrigin: "bottom center",
                transition: "transform 0.18s ease",
              }}
            >
              <div className={`rounded-lg ${ringClass}`}>
                <PlayingCard id={id} selected={isSelected} onClick={interactive ? () => onSelect(id) : undefined} />
              </div>
            </div>
          </Reorder.Item>
        );
      })}
    </Reorder.Group>
  );
}
