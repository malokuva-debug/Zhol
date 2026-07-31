import { customAlphabet } from "nanoid";
import type { Room, SeatState, GameState, HouseRules, ClientGameState, ChatMessage, GinType } from "./types";
import { DEFAULT_HOUSE_RULES } from "./types";
import { freshDeckIds, shuffle, minimizeDeadwood, canGin, classifyGin, resolveJokerPlaceholders, isJokerId } from "./gin-engine";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const genCode = customAlphabet(CODE_ALPHABET, 6);
export function generateRoomCode(): string {
  return genCode();
}

export function hashPassword(pw: string): string {
  let h = 0;
  for (let i = 0; i < pw.length; i++) h = (Math.imul(31, h) + pw.charCodeAt(i)) | 0;
  return `h${h}`;
}

export function makeSeat(nickname: string, clientId: string): SeatState {
  return {
    nickname,
    clientId,
    connected: true,
    lastSeenAt: Date.now(),
    ready: false,
    hand: [],
    score: 0,
    eliminated: false,
  };
}

/** Per the house rules: 2 players use a single 52-card deck + 2 jokers;
 * 3 or more players use two 52-card decks + 2 jokers (per the brief). */
export function decksForPlayerCount(maxPlayers: number): 1 | 2 {
  return maxPlayers >= 3 ? 2 : 1;
}

export function newRoom(opts: {
  name: string;
  visibility: "public" | "private";
  password?: string;
  rules?: Partial<HouseRules>;
  maxPlayers: number;
  hostNickname: string;
  hostClientId: string;
}): Room {
  const code = generateRoomCode();
  const maxPlayers = Math.min(6, Math.max(2, opts.maxPlayers));
  const seats: (SeatState | null)[] = new Array(maxPlayers).fill(null);
  seats[0] = makeSeat(opts.hostNickname, opts.hostClientId);
  return {
    code,
    name: opts.name.slice(0, 40) || `${opts.hostNickname}'s table`,
    visibility: opts.visibility,
    passwordHash: opts.password ? hashPassword(opts.password) : undefined,
    rules: { ...DEFAULT_HOUSE_RULES, ...opts.rules },
    maxPlayers,
    status: "waiting",
    hostClientId: opts.hostClientId,
    createdAt: Date.now(),
    seats,
    game: null,
    chat: [],
  };
}

function cryptoId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function addSystemMessage(room: Room, text: string) {
  room.chat.push({ id: cryptoId(), kind: "system", text, at: Date.now() });
  if (room.chat.length > 200) room.chat.shift();
}

export function tryJoinRoom(room: Room, nickname: string, clientId: string, password?: string): { ok: true } | { ok: false; error: string } {
  const existingIdx = room.seats.findIndex((s) => s?.clientId === clientId);
  if (existingIdx !== -1) {
    room.seats[existingIdx]!.connected = true;
    room.seats[existingIdx]!.lastSeenAt = Date.now();
    return { ok: true };
  }
  if (room.status !== "waiting") return { ok: false, error: "Game already in progress." };
  if (room.passwordHash && room.passwordHash !== hashPassword(password || "")) {
    return { ok: false, error: "Incorrect room password." };
  }
  const openIdx = room.seats.findIndex((s) => s === null);
  if (openIdx === -1) return { ok: false, error: "Room is full." };

  room.seats[openIdx] = makeSeat(nickname, clientId);
  addSystemMessage(room, `${nickname} joined the room.`);
  return { ok: true };
}

export function markLeft(room: Room, clientId: string): void {
  const idx = room.seats.findIndex((s) => s?.clientId === clientId);
  if (idx === -1) return;
  const nickname = room.seats[idx]!.nickname;
  if (room.status === "waiting") {
    room.seats[idx] = null;
    addSystemMessage(room, `${nickname} left the room.`);
    if (room.hostClientId === clientId) {
      const remaining = room.seats.find(Boolean);
      if (remaining) room.hostClientId = remaining.clientId;
    }
  } else {
    room.seats[idx]!.connected = false;
    room.seats[idx]!.lastSeenAt = Date.now();
    addSystemMessage(room, `${nickname} disconnected. Seat reserved for 2 minutes.`);
  }
}

export const RECONNECT_GRACE_MS = 2 * 60 * 1000;
export function isSeatExpired(seat: SeatState): boolean {
  return !seat.connected && Date.now() - seat.lastSeenAt > RECONNECT_GRACE_MS;
}

export function occupiedIdx(room: Room): number[] {
  const out: number[] = [];
  room.seats.forEach((s, i) => s && out.push(i));
  return out;
}

export function canStart(room: Room): boolean {
  const occ = occupiedIdx(room);
  if (occ.length < 2) return false;
  return occ.every((i) => room.seats[i]!.ready);
}

function activeIdx(room: Room): number[] {
  return occupiedIdx(room).filter((i) => !room.seats[i]!.eliminated);
}

function nextActiveIdx(room: Room, from: number): number {
  const active = activeIdx(room);
  const pos = active.indexOf(from);
  if (pos === -1) return active[0];
  return active[(pos + 1) % active.length];
}

export function startNewRound(room: Room, roundNumber: number): GameState {
  const active = activeIdx(room);
  // Turn order rotates clockwise each round
  const dealerIdx = active[(roundNumber - 1) % active.length];
  const startSeat = active[roundNumber % active.length];

  // --- CICMIC INITIALIZATION ---
  if (room.rules.gameMode === "cicmic") {
    const board: Record<number, 1 | 2 | null> = {};
    for (let i = 0; i < 24; i++) board[i] = null; // 24 empty points

    return {
      deck: [], discard: [], // Not used in Cicmic
      turnIdx: startSeat,
      turnPhase: "discard", // Reusing this to mean "Waiting for player move"
      turnStartedAt: Date.now(),
      roundNumber,
      matchOver: false,
      board,
      unplacedPieces: { 1: 9, 2: 9 },
      piecesOnBoard: { 1: 0, 2: 0 },
      cicmicPhase: { 1: "placement", 2: "placement" },
      pendingRemoval: false,
    };
  }
  
  if (room.rules.gameMode === "pishpirik") {
    // --- PISHPIRIK DEALING ---
    const deck = shuffle(freshDeckIds(1, 0)); // 52 cards, no jokers
    const tablePile = deck.splice(0, 4); // 4 to the middle
    
    // Deal 4 to each player
    for (const i of active) {
      room.seats[i]!.hand = deck.splice(0, 4);
    }

    return {
      deck,
      discard: [], // Not used in Pishpirik
      tablePile,
      capturedBySeat: {},
      pishpiriksBySeat: {},
      dealerIdx,
      turnIdx: startSeat,
      turnPhase: "discard", // Reusing 'discard' to mean 'play a card'
      turnStartedAt: Date.now(),
      roundNumber,
      matchOver: false,
    };
  }

  // --- ZHOL DEALING (Existing logic) ---
  const numDecks = decksForPlayerCount(room.maxPlayers);
  const deck = shuffle(freshDeckIds(numDecks, room.rules.jokerCount === 4 ? 4 : 2));
  
  for (const i of active) {
    room.seats[i]!.hand = deck.splice(0, 10);
  }
  room.seats[startSeat]!.hand.push(deck.pop()!);

  return {
    deck,
    discard: [],
    turnIdx: startSeat,
    turnPhase: "discard",
    turnStartedAt: Date.now(),
    roundNumber,
    matchOver: false,
  };
}

export function startGame(room: Room): void {
  room.status = "playing";
  room.game = startNewRound(room, 1);
  addSystemMessage(room, "Game started. No knocking here — first to Gin wins the round!");
}

export type MoveResult = { ok: true } | { ok: false; error: string };

export function applyDraw(room: Room, seatIdx: number, source: "stock" | "discard"): MoveResult {
  const g = room.game;
  if (!g) return { ok: false, error: "No active game." };
  if (g.turnIdx !== seatIdx) return { ok: false, error: "Not your turn." };
  if (g.turnPhase !== "draw") return { ok: false, error: "You must discard first." };
  const seat = room.seats[seatIdx]!;

  if (source === "stock") {
    if (g.deck.length === 0) return reshuffleOrWash(room);
    seat.hand.push(g.deck.pop()!);
  } else {
    if (g.discard.length === 0) return { ok: false, error: "Discard pile is empty." };
    seat.hand.push(g.discard.pop()!);
  }
  g.turnPhase = "discard";
  g.turnStartedAt = Date.now();
  return { ok: true };
}

function reshuffleOrWash(room: Room): MoveResult {
  const g = room.game!;
  if (g.discard.length <= 1) {
    addSystemMessage(room, "Stock exhausted — round ends with no score.");
    advanceRoundOrFinish(room);
    return { ok: true };
  }
  const top = g.discard.pop()!;
  g.deck = shuffle(g.discard);
  g.discard = [top];
  const seat = room.seats[g.turnIdx]!;
  seat.hand.push(g.deck.pop()!);
  g.turnPhase = "discard";
  g.turnStartedAt = Date.now();
  return { ok: true };
}

export function applyDiscard(room: Room, seatIdx: number, cardId: string): MoveResult {
  const g = room.game;
  if (!g) return { ok: false, error: "No active game." };
  if (g.turnIdx !== seatIdx) return { ok: false, error: "Not your turn." };
  if (g.turnPhase !== "discard") return { ok: false, error: "You must draw first." };
  const seat = room.seats[seatIdx]!;
  const idx = seat.hand.indexOf(cardId);
  if (idx === -1) return { ok: false, error: "Card not in hand." };

  seat.hand.splice(idx, 1);
  g.discard.push(cardId);
  g.turnIdx = nextActiveIdx(room, seatIdx);
  g.turnPhase = "draw";
  g.turnStartedAt = Date.now();
  return { ok: true };
}

/** The only way to end a round: discard down to a fully-melded 10-card hand. No knocking. */
export function applyGin(room: Room, seatIdx: number, cardIdToDiscard: string): MoveResult {
  const g = room.game;
  if (!g) return { ok: false, error: "No active game." };
  if (g.turnIdx !== seatIdx) return { ok: false, error: "Not your turn." };
  if (g.turnPhase !== "discard") return { ok: false, error: "You must draw first." };

  const seat = room.seats[seatIdx]!;
  const idx = seat.hand.indexOf(cardIdToDiscard);
  if (idx === -1) return { ok: false, error: "Card not in hand." };

  const handAfter = seat.hand.filter((c) => c !== cardIdToDiscard);
  if (!canGin(handAfter)) return { ok: false, error: "That hand is not Gin." };

  const solution = minimizeDeadwood(handAfter);
  const jokersInHand = handAfter.filter(isJokerId);
  const winnerMelds = resolveJokerPlaceholders(solution.melds, jokersInHand);
  
  // -> Pass cardIdToDiscard to determine if it was a Joker discard
  const ginType = classifyGin(handAfter, winnerMelds, cardIdToDiscard);

  seat.hand.splice(idx, 1);
  g.discard.push(cardIdToDiscard);

  resolveRound(room, seatIdx, ginType, winnerMelds);
  return { ok: true };
}

function resolveRound(room: Room, winnerIdx: number, ginType: GinType, winnerMelds: import("./types").Meld[]) {
  const g = room.game!;
  const bonus = room.rules.ginBonuses[ginType];
  const pointsBySeat: import("./types").RoundEndInfo["pointsBySeat"] = [];

  // Winner: score decreases by the gin-type bonus (can go negative — no floor).
  const winnerSeat = room.seats[winnerIdx]!;
  winnerSeat.score -= bonus;

  // Everyone else still in the round: score increases by their own deadwood only.
  for (const i of activeIdx(room)) {
    if (i === winnerIdx) continue;
    const seat = room.seats[i]!;
    const solution = minimizeDeadwood(seat.hand);
    seat.score += solution.deadwood;
    const eliminated = seat.score >= room.rules.eliminationScore;
    if (eliminated) seat.eliminated = true;
    // Any joker(s) not consumed by a meld are also "dead" — surface them for
    // the client-side breakdown animation alongside the real dead cards.
    const jokerIdsInHand = seat.hand.filter(isJokerId);
    const unusedJokerIds = jokerIdsInHand.slice(solution.jokersUsed);
    pointsBySeat.push({ seatIdx: i, deadwood: solution.deadwood, deadCards: [...solution.deadCards, ...unusedJokerIds], eliminated });
  }

  g.turnPhase = "round_over";
  g.lastRoundEnd = { type: ginType, winnerIdx, winnerMelds, winnerBonus: bonus, pointsBySeat };

  const label = { normal_gin: "Gin", joker_gin: "Joker Gin", suit_gin: "Suit Gin", suit_joker_gin: "Suit + Joker Gin" }[ginType];
  addSystemMessage(room, `${room.seats[winnerIdx]?.nickname} declares ${label}! (-${bonus} pts) — opponents add their deadwood.`);

  advanceRoundOrFinish(room);
}

function advanceRoundOrFinish(room: Room) {
  const g = room.game!;
  const stillActive = activeIdx(room);

  if (stillActive.length <= 1) {
    g.matchOver = true;
    g.matchWinnerIdx = stillActive[0];
    room.status = "finished";
    addSystemMessage(room, `${room.seats[stillActive[0]]?.nickname} wins the match!`);
    return;
  }

  const nextRoundNum = g.roundNumber + 1;
  const nextGame = startNewRound(room, nextRoundNum);
  nextGame.lastRoundEnd = g.lastRoundEnd;
  room.game = nextGame;
}

export function toClientGameState(room: Room, viewerSeat: number): ClientGameState | null {
  const g = room.game;
  if (!g) return null;
  const seat = room.seats[viewerSeat];
  if (!seat) return null;

  const opponents = occupiedIdx(room)
    .filter((i) => i !== viewerSeat)
    .map((i) => {
      const s = room.seats[i]!;
      return {
        seatIdx: i,
        nickname: s.nickname,
        connected: s.connected,
        cardCount: s.hand.length,
        score: s.score,
        eliminated: s.eliminated,
      };
    });

  return {
    yourSeat: viewerSeat,
    deck: g.deck, // Send the actual deck array instead of deckCount
    discardTop: g.discard.length ? g.discard[g.discard.length - 1] : null,
    discard: g.discard,
    yourHand: seat.hand,
    opponents,
    turnIdx: g.turnIdx,
    turnPhase: g.turnPhase,
    turnStartedAt: g.turnStartedAt,
    turnTimerSeconds: room.rules.turnTimerSeconds,
    roundNumber: g.roundNumber,
    lastRoundEnd: g.lastRoundEnd,
    matchOver: g.matchOver,
    matchWinnerIdx: g.matchWinnerIdx,
  };
}

export function redactRoomForClient(room: Room) {
  const { passwordHash: _passwordHash, ...rest } = room;
  return rest;
}
