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
  // Handles deck suffixes if present (e.g., "10D_1" -> "10D")
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

  // Authentic Pishpirik Rule:
  // You only get a Pishpirik if the ranks match EXACTLY.
  // Playing a Jack on a single non-Jack card is just a capture, NOT a Pishpirik!
  if (captures && tablePile.length === 1) {
    if (played.rank === topTable.rank) {
      isPishpirik = true;
      if (played.rank === "J") {
        isJackPishpirik = true; // Jack on Jack = 20 pts bonus
      }
    }
  }

  return { captures, isPishpirik, isJackPishpirik };
}

export function scorePishpirikCards(capturedCards: string[]) {
  let score = 0;
  
  for (const cardId of capturedCards) {
    const { rank, suit } = parseCardId(cardId);
    
    // EXACT counting rules requested:
    if (rank === "2" && suit === "C") {
      score += 1;
    } else if (rank === "10" && suit === "D") {
      score += 2;
    } else if (rank === "10") {
      score += 1; // 10H, 10C, 10S
    } else if (rank === "J" || rank === "Q" || rank === "K" || rank === "A") {
      score += 1; // All suits for J, Q, K, A
    }
  }

  return score;
}

/**
 * Generates a standard 52-card deck (no jokers) and shuffles it.
 */
export function createPishpirikDeck(): CardId[] {
  return shuffle(freshDeckIds(1, 0)); // 1 deck, 0 jokers
}
