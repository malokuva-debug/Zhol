import type { Card, CardId, Meld, Rank, Suit, GinType } from "./types";

const SUITS: Suit[] = ["S", "H", "D", "C"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/**
 * ASSUMPTION (undocumented in the brief): an unmelded joker left in a losing
 * hand counts as 15 deadwood points. This value is centralized here so it's
 * a one-line change if your house rule differs.
 */
export const JOKER_DEADWOOD_VALUE = 15;

export function cardValue(rank: Rank): number {
  // Kosovo-style: number cards = face value, A/J/Q/K all count as 10.
  if (rank === "J" || rank === "Q" || rank === "K" || rank === "A") return 10;
  return parseInt(rank, 10);
}

export function isJokerId(id: CardId): boolean {
  return id.startsWith("JK");
}

export function makeCard(id: CardId): Card {
  if (isJokerId(id)) {
    return { id, rank: "JOKER", suit: null, value: 0, isJoker: true };
  }
  const base = id.split("_")[0]; // strip "_2" deck-disambiguation suffix
  const suit = base.slice(-1) as Suit;
  const rank = base.slice(0, -1) as Rank;
  return { id, rank, suit, value: cardValue(rank), isJoker: false };
}

/** Builds N standard 52-card decks plus the given number of jokers, all with unique ids. */
export function freshDeckIds(numDecks: 1 | 2 = 1, jokerCount: 0 | 2 | 4 = 2): CardId[] {
  const ids: CardId[] = [];
  for (let d = 0; d < numDecks; d++) {
    const suffix = d === 0 ? "" : `_${d + 1}`;
    for (const s of SUITS) for (const r of RANKS) ids.push(`${r}${s}${suffix}`);
  }
  for (let j = 0; j < jokerCount; j++) ids.push(`JK${j + 1}`);
  return ids;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const RANK_LOW: Record<Rank, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
};
// Ace-high numbering — used only to detect Q-K-A. Every other rank keeps the
// same value as RANK_LOW, so a chain can never accidentally bridge across the
// ace both ways (K-A-2 correctly fails: 13, 14, 2 is not consecutive).
const RANK_HIGH: Record<Rank, number> = { ...RANK_LOW, A: 14 };

interface RealMeld extends Meld {
  usesJoker: 0 | 1 | 2;
}

/** All valid real-card-only sets and runs (no wildcards), both ace numberings. */
function candidateRealMelds(cards: Card[]): RealMeld[] {
  const melds: RealMeld[] = [];

  const byRank = new Map<Rank, Card[]>();
  for (const c of cards) {
    if (c.isJoker) continue;
    const r = c.rank as Rank;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(c);
  }
  for (const [, group] of byRank) {
    if (group.length >= 3) {
      melds.push({ type: "set", cards: group.map((c) => c.id), usesJoker: 0 });
      if (group.length > 3) {
        for (const trio of combinations(group, 3)) melds.push({ type: "set", cards: trio.map((c) => c.id), usesJoker: 0 });
      }
      if (group.length > 4) {
        for (const quad of combinations(group, 4)) melds.push({ type: "set", cards: quad.map((c) => c.id), usesJoker: 0 });
      }
    }
  }

  const bySuit = new Map<Suit, Card[]>();
  for (const c of cards) {
    if (c.isJoker) continue;
    const s = c.suit as Suit;
    if (!bySuit.has(s)) bySuit.set(s, []);
    bySuit.get(s)!.push(c);
  }
  for (const [, group] of bySuit) {
    for (const numbering of [RANK_LOW, RANK_HIGH]) {
      const sorted = [...group].sort((a, b) => numbering[a.rank as Rank] - numbering[b.rank as Rank]);
      let chainStart = 0;
      for (let i = 1; i <= sorted.length; i++) {
        const broke = i === sorted.length || numbering[sorted[i].rank as Rank] !== numbering[sorted[i - 1].rank as Rank] + 1;
        if (broke) {
          const chain = sorted.slice(chainStart, i);
          for (let len = 3; len <= chain.length; len++) {
            for (let start = 0; start + len <= chain.length; start++) {
              melds.push({ type: "run", cards: chain.slice(start, start + len).map((c) => c.id), usesJoker: 0 });
            }
          }
          chainStart = i;
        }
      }
    }
  }

  return melds;
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k > arr.length) return [];
  if (k === 0) return [[]];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

/**
 * Expands real-card melds with joker-substituted variants: a rank group one
 * card short of a set, or a run chain one card short (internal gap or a
 * one-card extension at either end), can complete using a joker as a wildcard.
 */
function candidateJokerMelds(cards: Card[], jokersAvailable: number): RealMeld[] {
  if (jokersAvailable <= 0) return [];
  const melds: RealMeld[] = [];

  const byRank = new Map<Rank, Card[]>();
  for (const c of cards) {
    if (c.isJoker) continue;
    const r = c.rank as Rank;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(c);
  }
  for (const [, group] of byRank) {
    // 3-set = any 2 real cards of this rank + 1 joker (frees the rest of the group, if any)
    if (jokersAvailable >= 1 && group.length >= 2) {
      for (let a = 0; a < group.length; a++) {
        for (let b = a + 1; b < group.length; b++) {
          melds.push({ type: "set", cards: [group[a].id, group[b].id, "__JOKER__"], usesJoker: 1 });
        }
      }
    }
    // 4-set = any 3 real cards of this rank + 1 joker (leaves the rest of the group free for
    // other uses — matters whenever more than 3 cards of a rank are in hand, e.g. all 4 suits,
    // or duplicates from a second deck in 3+ player games).
    if (jokersAvailable >= 1 && group.length >= 3) {
      for (const trio of combinations(group, 3)) {
        melds.push({ type: "set", cards: trio.map((c) => c.id).concat(["__JOKER__"]), usesJoker: 1 });
      }
    }
    // 3-set = 1 real card of this rank + 2 jokers
    if (jokersAvailable >= 2 && group.length >= 1) {
      for (const c of group) {
        melds.push({ type: "set", cards: [c.id, "__JOKER__", "__JOKER__"], usesJoker: 2 });
      }
    }
  }

  const bySuit = new Map<Suit, Card[]>();
  for (const c of cards) {
    if (c.isJoker) continue;
    const s = c.suit as Suit;
    if (!bySuit.has(s)) bySuit.set(s, []);
    bySuit.get(s)!.push(c);
  }
  for (const [, group] of bySuit) {
    for (const numbering of [RANK_LOW, RANK_HIGH]) {
      const present = new Map<number, Card>();
      for (const c of group) present.set(numbering[c.rank as Rank], c);
      const values = [...present.keys()].sort((a, b) => a - b);

      // Break into maximal contiguous real chains, e.g. [4,5,6] and [9] separately.
      const chains: Card[][] = [];
      let cur: Card[] = [];
      for (let i = 0; i < values.length; i++) {
        if (i > 0 && values[i] !== values[i - 1] + 1) {
          chains.push(cur);
          cur = [];
        }
        cur.push(present.get(values[i])!);
      }
      if (cur.length) chains.push(cur);

      // Extend ANY contiguous sub-chain by 1 or 2 jokers at either end (or
      // bracketing both ends) — this is what lets a joker complete a run of
      // any length, e.g. 4 real cards + 1 joker = 5-run. A run needs >= 3
      // cards total, so a 1-joker extension needs a sub-chain of length >= 2
      // (single real card + 1 joker = 2 cards is not a valid meld).
      for (const chain of chains) {
        for (let start = 0; start < chain.length; start++) {
          for (let len = 1; len <= chain.length - start; len++) {
            const sub = chain.slice(start, start + len);
            const ids = sub.map((c) => c.id);
            if (jokersAvailable >= 1 && sub.length >= 2) {
              melds.push({ type: "run", cards: ["__JOKER__", ...ids], usesJoker: 1 });
              melds.push({ type: "run", cards: [...ids, "__JOKER__"], usesJoker: 1 });
            }
            if (jokersAvailable >= 2) {
              melds.push({ type: "run", cards: ["__JOKER__", "__JOKER__", ...ids], usesJoker: 2 });
              melds.push({ type: "run", cards: [...ids, "__JOKER__", "__JOKER__"], usesJoker: 2 });
              melds.push({ type: "run", cards: ["__JOKER__", ...ids, "__JOKER__"], usesJoker: 2 });
            }
          }
        }
      }

      // Bridge two chains separated by exactly one missing rank, with 1 joker.
      // Use every combination of a suffix of the left chain + the joker +
      // a prefix of the right chain (not just the two adjacent endpoint
      // cards) — e.g. 3H,4H | gap | 6H must be able to form the full 4-card
      // run 3H-4H-JOKER-6H, not just 4H-JOKER-6H while stranding 3H.
      for (let i = 0; i < chains.length - 1; i++) {
        const left = chains[i];
        const right = chains[i + 1];
        const leftEndVal = numbering[left[left.length - 1].rank as Rank];
        const rightStartVal = numbering[right[0].rank as Rank];
        if (rightStartVal - leftEndVal !== 2 || jokersAvailable < 1) continue;

        for (let sufLen = 1; sufLen <= left.length; sufLen++) {
          for (let preLen = 1; preLen <= right.length; preLen++) {
            const suffix = left.slice(left.length - sufLen);
            const prefix = right.slice(0, preLen);
            melds.push({
              type: "run",
              cards: [...suffix.map((c) => c.id), "__JOKER__", ...prefix.map((c) => c.id)],
              usesJoker: 1,
            });
          }
        }
      }
    }
  }

  return melds;
}

interface MeldSolution {
  deadwood: number;
  melds: RealMeld[];
  deadCards: CardId[];
  jokersUsed: number;
  jokersUnused: number;
}

/**
 * Finds the meld arrangement that minimizes total deadwood for a hand,
 * accounting for jokers as wildcards. Search space is small (≤11 cards,
 * ≤4 jokers) so plain recursive backtracking is instant.
 */
export function minimizeDeadwood(handIds: CardId[]): MeldSolution {
  const allCards = handIds.map(makeCard);
  const realCards = allCards.filter((c) => !c.isJoker);
  const jokerIds = allCards.filter((c) => c.isJoker).map((c) => c.id);
  const jokerCount = jokerIds.length;
  const suits = new Set(realCards.map((c) => c.suit));
  if (suits.size <= 1) {
    return {
      deadwood: 0,
      melds: [{ type: "run", cards: handIds, usesJoker: 0 }], 
      deadCards: [],
      jokersUsed: jokerCount,
      jokersUnused: 0,
    };
  }
  // -----------------------------------

  const cardMap = new Map(realCards.map((c) => [c.id, c]));
  const candidates = [...candidateRealMelds(realCards), ...candidateJokerMelds(realCards, jokerCount)];

  let best: MeldSolution | null = null;

  function score(remainingReal: Set<CardId>, jokersUnused: number): number {
    let dead = 0;
    for (const id of remainingReal) dead += cardMap.get(id)!.value;
    dead += jokersUnused * JOKER_DEADWOOD_VALUE;
    return dead;
  }

  function search(remainingReal: Set<CardId>, jokersLeft: number, chosen: RealMeld[], startIdx: number) {
    const deadwood = score(remainingReal, jokersLeft);
    if (!best || deadwood < best.deadwood) {
      best = {
        deadwood,
        melds: [...chosen],
        deadCards: [...remainingReal],
        jokersUsed: jokerCount - jokersLeft,
        jokersUnused: jokersLeft,
      };
    }
    if (deadwood === 0) return;

    for (let i = startIdx; i < candidates.length; i++) {
      const m = candidates[i];
      const realNeeded = m.cards.filter((c) => c !== "__JOKER__");
      if (m.usesJoker > jokersLeft) continue;
      if (!realNeeded.every((c) => remainingReal.has(c))) continue;

      const next = new Set(remainingReal);
      realNeeded.forEach((c) => next.delete(c));
      search(next, jokersLeft - m.usesJoker, [...chosen, m], i + 1);
    }
  }

  search(new Set(realCards.map((c) => c.id)), jokerCount, [], 0);
  return best!;
}

export function canGin(handIds: CardId[]): boolean {
  const solution = minimizeDeadwood(handIds);
  return solution.deadwood === 0 && solution.jokersUnused === 0;
}

/**
 * Given an 11-card hand (10 after a discard), tries discarding every card in
 * turn and returns the first one that leaves a fully-melded 0-deadwood
 * 10-card hand — i.e. "is Gin achievable, and with which discard". Returns
 * null if no discard achieves Gin. This is what the client uses to decide
 * whether the Gin button is enabled at all, independent of which card (if
 * any) the player has manually selected.
 */
export function findGinDiscard(hand11: CardId[]): CardId | null {
  for (const candidate of hand11) {
    const remaining = hand11.filter((c) => c !== candidate);
    if (canGin(remaining)) return candidate;
  }
  return null;
}

/** Determines the win-category (and thus bonus) for a fully-melded winning hand. */
export function classifyGin(handIds: CardId[], melds: Meld[], discardId: CardId): GinType {
  const discardedJoker = isJokerId(discardId);
  
  // Check if all 10 cards are the same suit (ignoring any jokers still held in hand)
  const realCards = handIds.filter((id) => !isJokerId(id)).map(makeCard);
  const suits = new Set(realCards.map((c) => c.suit));
  const allSameSuit = suits.size <= 1;

  if (allSameSuit && discardedJoker) return "suit_joker_gin";
  if (allSameSuit && !discardedJoker) return "suit_gin";
  if (discardedJoker) return "joker_gin";
  
  return "normal_gin";
}

/**
 * Resolves the `__JOKER__` placeholder cards in a solved meld list back to
 * actual joker card ids from the hand, so the client can render exactly
 * which physical card filled which slot.
 */
export function resolveJokerPlaceholders(melds: RealMeld[], jokerIdsInHand: CardId[]): Meld[] {
  const pool = [...jokerIdsInHand];
  return melds.map((m) => ({
    type: m.type,
    cards: m.cards.map((c) => (c === "__JOKER__" ? pool.shift()! : c)),
  }));
}
