import type { CardId, Rank, Suit } from "./types";
import { freshDeckIds, shuffle } from "./gin-engine";

export function parseCard(id: CardId): { rank: Rank; suit: Suit } {
  const base = id.split("_")[0];
  return { rank: base.slice(0, -1) as Rank, suit: base.slice(-1) as Suit };
}

/**
 * Calculates the raw point value of a pile of cards.
 * 2C = 1, 10D = 2, 10-A = 1
 */
export function parseCardId(id: string) {
  const base = id.split("_")[0];
  return { rank: base.slice(0, -1), suit: base.slice(-1) };
}

export function checkPishpirikCapture(playedCardId: string, tablePile: string[]) {
  if (tablePile.length === 0) return { captures: false, isPishpirik: false, isJackPishpirik: false };

  const played = parseCardId(playedCardId);
  const topTableId = tablePile[tablePile.length - 1];
  const topTable = parseCardId(topTableId);

  let captures = false;
  let isPishpirik = false;
  let isJackPishpirik = false;

  // Capture conditions: matching rank, OR playing a Jack
  if (played.rank === topTable.rank || played.rank === "J") {
    captures = true;
  }

  // Pishpirik happens if there is EXACTLY 1 card on the table and we captured it
  if (captures && tablePile.length === 1) {
    isPishpirik = true;
    if (played.rank === "J" && topTable.rank === "J") {
      isJackPishpirik = true;
    }
  }

  return { captures, isPishpirik, isJackPishpirik };
}

export function scorePishpirikCards(capturedCards: string[]) {
  let score = 0;
  for (const cardId of capturedCards) {
    const { rank, suit } = parseCardId(cardId);
    
    if (rank === "2" && suit === "C") score += 1;
    else if (rank === "10" && suit === "D") score += 2;
    else if (rank === "10") score += 1; // 10H, 10S, 10C
    else if (["J", "Q", "K", "A"].includes(rank)) score += 1;
  }
  return score;
}

/**
 * Generates a standard 52-card deck (no jokers) and shuffles it.
 */
export function createPishpirikDeck(): CardId[] {
  return shuffle(freshDeckIds(1, 0)); // 1 deck, 0 jokers
}
