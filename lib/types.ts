// Add the game mode selection
export type GameMode = "zhol" | "pishpirik";

export interface HouseRules {
  gameMode: GameMode; // <-- ADD THIS
  ginBonuses: Record<GinType, number>;
  eliminationScore: number;
  turnTimerSeconds: number;
  jokerCount: 0 | 2 | 4;
}

export const DEFAULT_HOUSE_RULES: HouseRules = {
  gameMode: "zhol", // Default to Zhol
  ginBonuses: DEFAULT_GIN_BONUSES,
  eliminationScore: 101,
  turnTimerSeconds: 30,
  jokerCount: 2,
};

// Expand GameState to hold Pishpirik data
export interface GameState {
  deck: CardId[];
  discard: CardId[];
  turnIdx: number;
  turnPhase: TurnPhase;
  turnStartedAt: number;
  roundNumber: number;
  lastRoundEnd?: RoundEndInfo;
  matchOver: boolean;
  matchWinnerIdx?: number;
  
  // --- PISHPIRIK SPECIFIC STATE ---
  dealerIdx?: number; // Tracks who dealt to rotate properly
  tablePile?: CardId[]; // The pile of cards in the middle of the table
  capturedBySeat?: Record<number, CardId[]>; // Tracks what each player has eaten
  pishpiriksBySeat?: Record<number, number>; // Tracks number of Pishpiriks scored
  lastCaptureIdx?: number; // Remembers who took last so they get the remaining table cards at the end
}

// Core domain types for Zhol (Kosovo-style Gin Rummy) — Gin-only variant with jokers.

export type Suit = "S" | "H" | "D" | "C";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

/** Card id, e.g. "AS", "10H". Jokers are "JK1"/"JK2" (or "JK3"/"JK4" in 2-deck mode). */
export type CardId = string;

export interface Card {
  id: CardId;
  rank: Rank | "JOKER";
  suit: Suit | null;
  value: number; // number cards = face value; A/J/Q/K = 10; joker = 0 while held as a wildcard in a meld
  isJoker: boolean;
}

export type MeldType = "set" | "run";

export interface Meld {
  type: MeldType;
  cards: CardId[]; // includes any joker(s) used as wildcards in this meld
}

export type RoomStatus = "waiting" | "playing" | "finished";
export type Visibility = "public" | "private";

/**
 * Win categories and their bonus points, added to a losing player's running
 * total on top of their own deadwood value.
 *   normal_gin        — fully melded hand, no joker used, not all one suit
 *   joker_gin         — fully melded hand, at least one joker used as a wildcard
 *   suit_gin          — fully melded hand, every card the same suit, no joker
 *   suit_joker_gin    — fully melded hand, every non-joker card the same suit, joker used
 */
export type GinType = "normal_gin" | "joker_gin" | "suit_gin" | "suit_joker_gin";

export interface HouseRules {
  ginBonuses: Record<GinType, number>;
  eliminationScore: number; // reaching/exceeding this score eliminates a player (default 101)
  turnTimerSeconds: number; // 0 = no timer
  jokerCount: 0 | 2 | 4; // 2 for a single 52-card deck, 4 if you want extra wildcards in 2-deck games
}

export const DEFAULT_GIN_BONUSES: Record<GinType, number> = {
  normal_gin: 10,
  joker_gin: 20,
  suit_gin: 25,
  suit_joker_gin: 50,
};

export const DEFAULT_HOUSE_RULES: HouseRules = {
  ginBonuses: DEFAULT_GIN_BONUSES,
  eliminationScore: 101,
  turnTimerSeconds: 30,
  jokerCount: 2,
};

export interface SeatState {
  nickname: string;
  clientId: string;
  connected: boolean;
  lastSeenAt: number;
  ready: boolean;
  hand: CardId[];
  score: number; // penalty points accumulated; reaching eliminationScore eliminates this seat
  eliminated: boolean;
}

export type TurnPhase = "draw" | "discard" | "round_over";

export interface RoundEndInfo {
  type: GinType;
  winnerIdx: number;
  winnerMelds: Meld[];
  winnerBonus: number; // subtracted from the winner's score
  pointsBySeat: { seatIdx: number; deadwood: number; deadCards: CardId[]; eliminated: boolean }[]; // added to each loser's score
}

export interface GameState {
  deck: CardId[];
  discard: CardId[];
  turnIdx: number; // index into seats[] (skips eliminated seats)
  turnPhase: TurnPhase;
  turnStartedAt: number;
  roundNumber: number;
  lastRoundEnd?: RoundEndInfo;
  matchOver: boolean;
  matchWinnerIdx?: number;
}

export interface ChatMessage {
  id: string;
  kind: "chat" | "system";
  nickname?: string;
  text: string;
  at: number;
}

export interface Room {
  code: string;
  name: string;
  visibility: Visibility;
  passwordHash?: string;
  rules: HouseRules;
  maxPlayers: number; // 2-6
  status: RoomStatus;
  hostClientId: string;
  createdAt: number;
  seats: (SeatState | null)[]; // length === maxPlayers
  game: GameState | null;
  chat: ChatMessage[];
}

export interface RoomSummary {
  code: string;
  name: string;
  visibility: Visibility;
  hasPassword: boolean;
  hostNickname: string;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
  rules: HouseRules;
  createdAt: number;
}

export interface ClientOpponentView {
  seatIdx: number;
  nickname: string;
  connected: boolean;
  cardCount: number;
  score: number;
  eliminated: boolean;
}

export interface ClientGameState {
  yourSeat: number;
  deck: CardId[]; // Changed from deckCount: number
  discardTop: CardId | null;
  discard: CardId[];
  yourHand: CardId[];
  opponents: ClientOpponentView[];
  turnIdx: number;
  turnPhase: TurnPhase;
  turnStartedAt: number;
  turnTimerSeconds: number;
  roundNumber: number;
  lastRoundEnd?: RoundEndInfo;
  matchOver: boolean;
  matchWinnerIdx?: number;
}
