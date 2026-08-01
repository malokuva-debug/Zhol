import type { CardId, Rank, Suit } from "./types";
import { freshDeckIds, shuffle } from "./gin-engine";

export function parseCard(id: CardId): { rank: Rank; suit: Suit } {
  const base = id.split("_")[0];
  return { rank: base.slice(0, -1) as Rank, suit: base.slice(-1) as Suit };
}

/** 
 * Checks if a played card captures the table pile.
 * Returns whether it captures, and whether it counts as a Pishpirik.
 */
export function checkPishpirikCapture(
  playedCard: CardId,
  tablePile: CardId[]
): { captures: boolean; isPishpirik: boolean } {
  if (tablePile.length === 0) return { captures: false, isPishpirik: false };

  const played = parseCard(playedCard);
  const topTable = parseCard(tablePile[tablePile.length - 1]);

  const isMatch = played.rank === topTable.rank;
  const isJack = played.rank === "J";

  const captures = isMatch || isJack;
  
  // Pishpirik is only when exactly 1 card is on the table, and it is captured by the SAME rank.
  // (Playing a Jack on a non-Jack does not count as a Pishpirik, just a capture).
  const isPishpirik = tablePile.length === 1 && isMatch;

  return { captures, isPishpirik };
}

/**
 * Calculates the raw point value of a pile of cards.
 * 2C = 1, 10D = 2, 10-A = 1
 */
export function scorePishpirikCards(cards: CardId[]): number {
  let score = 0;
  for (const id of cards) {
    const { rank, suit } = parseCard(id);
    
    if (rank === "2" && suit === "C") score += 1;
    else if (rank === "10" && suit === "D") score += 2;
    else if (["10", "J", "Q", "K", "A"].includes(rank)) score += 1;
  }
  return score;
}

/**
 * Generates a standard 52-card deck (no jokers) and shuffles it.
 */
export function createPishpirikDeck(): CardId[] {
  return shuffle(freshDeckIds(1, 0)); // 1 deck, 0 jokers
}
