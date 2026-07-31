// Core domain types for Zhol, Pishpirik, and Cicmic

export type Suit = "S" | "H" | "D" | "C";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

/** Card id, e.g. "AS", "10H". Jokers are "JK1"/"JK2" */
export type CardId = string;

export interface Card {
  id: CardId;
  rank: Rank | "JOKER";
  suit: Suit | null;
  value: number;
  isJoker: boolean;
}

export type MeldType = "set" | "run";
export interface Meld {
  type: MeldType;
  cards: CardId[];
}

export type RoomStatus = "waiting" | "playing" | "finished";
export type Visibility = "public" | "private";

export type GinType = "normal_gin" | "joker_gin" | "suit_gin" | "suit_joker_gin";

// --- NEW GAME MODES ---
export type GameMode = "zhol" | "pishpirik" | "cicmic";
export type TeamMode = "1v1" | "2v2" | "free";
export type CicmicPlayer = 1 | 2;
export type CicmicPhase = "placement" | "movement" | "flying";

export interface HouseRules {
  gameMode: GameMode;
  teamMode?: TeamMode;
  ginBonuses: { gin: number; bigGin: number; superGin: number };
  eliminationScore: number;
  turnTimerSeconds: number;
  jokerCount: 0 | 2 | 4;
}

export const DEFAULT_HOUSE_RULES: HouseRules = {
  gameMode: "zhol",
  ginBonuses: { gin: 25, bigGin: 50, superGin: 100 },
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
  score: number;
  eliminated: boolean;
  team?: 1 | 2;
}

export type TurnPhase = "draw" | "discard" | "round_over";

export interface RoundEndInfo {
  type: GinType;
  winnerIdx: number;
  winnerMelds: Meld[];
  winnerBonus: number;
  pointsBySeat: { seatIdx: number; deadwood: number; deadCards: CardId[]; eliminated: boolean }[];
}

export interface GameState {
  deck: CardId[];
  discard: CardId[];
  discardTop: CardId | null;
  turnIdx: number;
  turnPhase: TurnPhase;
  turnStartedAt: number;
  turnTimerSeconds: number;
  roundNumber: number;
  lastRoundEnd?: RoundEndInfo;
  matchOver: boolean;
  matchWinnerIdx?: number;

  // --- PISHPIRIK STATE ---
  dealerIdx?: number;
  tablePile?: CardId[];
  capturedBySeat?: Record<number, CardId[]>;
  pishpiriksBySeat?: Record<number, number>;
  lastCaptureIdx?: number;

  // --- CICMIC STATE ---
  board?: Record<number, CicmicPlayer | null>;
  unplacedPieces?: Record<CicmicPlayer, number>;
  piecesOnBoard?: Record<CicmicPlayer, number>;
  cicmicPhase?: Record<CicmicPlayer, CicmicPhase>;
  pendingRemoval?: boolean;
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
  maxPlayers: number;
  status: RoomStatus;
  hostClientId: string;
  createdAt: number;
  updatedAt: number;
  seats: (SeatState | null)[];
  game: GameState | null;
  chat: ChatMessage[];
  systemMessages: string[];
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
  team?: 1 | 2;
}

export interface ClientGameState {
  yourSeat: number;
  deck: CardId[];
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

  // Expose new modes to client safely
  dealerIdx?: number;
  tablePile?: CardId[];
  capturedBySeat?: Record<number, CardId[]>;
  pishpiriksBySeat?: Record<number, number>;
  board?: Record<number, CicmicPlayer | null>;
  unplacedPieces?: Record<CicmicPlayer, number>;
  piecesOnBoard?: Record<CicmicPlayer, number>;
  cicmicPhase?: Record<CicmicPlayer, CicmicPhase>;
  pendingRemoval?: boolean;
}
