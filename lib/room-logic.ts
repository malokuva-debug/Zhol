import { Room, SeatState, ClientGameState } from "./types";

export function newRoom(opts: {
  name: string;
  visibility: "public" | "private";
  password?: string;
  maxPlayers: number;
  hostNickname: string;
  hostClientId: string;
  rules: {
    gameMode: "zhol" | "pishpirik" | "cicmic";
    teamMode?: "1v1" | "2v2" | "free";
    turnTimerSeconds: number;
    eliminationScore: number;
  };
}): Room {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const seats: (SeatState | null)[] = Array(opts.maxPlayers).fill(null);

  seats[0] = {
    nickname: opts.hostNickname,
    clientId: opts.hostClientId,
    connected: true,
    lastSeenAt: Date.now(),
    ready: false,
    hand: [],
    score: 0,
    eliminated: false,
    team: opts.rules.teamMode === "2v2" ? 1 : undefined,
  };

  return {
    code,
    name: opts.name,
    visibility: opts.visibility,
    passwordHash: opts.password || undefined,
    maxPlayers: opts.maxPlayers,
    hostClientId: opts.hostClientId,
    status: "waiting",
    seats,
    rules: {
      gameMode: opts.rules.gameMode,
      teamMode: opts.rules.teamMode || "free",
      ginBonuses: { gin: 25, bigGin: 50, superGin: 100 },
      eliminationScore: opts.rules.eliminationScore,
      turnTimerSeconds: opts.rules.turnTimerSeconds,
      jokerCount: 2,
    },
    systemMessages: [`Room ${code} created by ${opts.hostNickname}.`],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function addSystemMessage(room: Room, msg: string) {
  room.systemMessages.push(msg);
  if (room.systemMessages.length > 50) room.systemMessages.shift();
}

export function initializeGame(room: Room) {
  const mode = room.rules.gameMode;
  
  if (mode === "cicmic") {
    // 24-point board initialized with explicit nulls
    const board: Record<number, 1 | 2 | null> = {};
    for (let i = 0; i < 24; i++) board[i] = null;

    room.game = {
      roundNumber: 1,
      turnIdx: 0,
      turnPhase: "discard",
      turnStartedAt: Date.now(),
      turnTimerSeconds: room.rules.turnTimerSeconds,
      deck: [],
      discard: [],
      discardTop: null,
      matchOver: false,
      board,
      pendingRemoval: false,
    };
    return;
  }

  if (mode === "pishpirik") {
    const deck = generateStandardDeck();
    shuffle(deck);

    // Deal 4 cards to table
    const tablePile = deck.splice(0, 4);

    // Deal 4 cards to each active player
    room.seats.forEach((seat) => {
      if (seat) {
        seat.hand = deck.splice(0, 4);
      }
    });

    room.game = {
      roundNumber: 1,
      turnIdx: 0,
      turnPhase: "discard",
      turnStartedAt: Date.now(),
      turnTimerSeconds: room.rules.turnTimerSeconds,
      deck,
      discard: [],
      discardTop: null,
      tablePile,
      capturedBySeat: {},
      pishpiriksBySeat: {},
      matchOver: false,
    };
    return;
  }

  // Zhol (Standard Gin Rummy setup)
  const deck = generateZholDeck(room.seats.filter(Boolean).length);
  shuffle(deck);

  const activeSeatIndices = room.seats.map((s, i) => (s ? i : -1)).filter((i) => i !== -1);
  const starterSeat = activeSeatIndices[0];

  activeSeatIndices.forEach((seatIdx) => {
    const count = seatIdx === starterSeat ? 11 : 10;
    room.seats[seatIdx]!.hand = deck.splice(0, count);
  });

  const topDiscard = deck.pop() || null;

  room.game = {
    roundNumber: 1,
    turnIdx: starterSeat,
    turnPhase: starterSeat === 0 ? "discard" : "draw",
    turnStartedAt: Date.now(),
    turnTimerSeconds: room.rules.turnTimerSeconds,
    deck,
    discard: topDiscard ? [topDiscard] : [],
    discardTop: topDiscard,
    matchOver: false,
  };
}

function generateStandardDeck(): string[] {
  const suits = ["S", "H", "D", "C"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];
  const deck: string[] = [];
  suits.forEach((s) => ranks.forEach((r) => deck.push(`${r}${s}`)));
  return deck;
}

function generateZholDeck(playerCount: number): string[] {
  const single = generateStandardDeck();
  if (playerCount <= 2) return [...single, "JK1", "JK2"];
  return [...single, ...generateStandardDeck(), "JK1", "JK2", "JK3", "JK4"];
}

function shuffle(array: any[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

export function applyDraw(room: Room, seatIdx: number, source: "stock" | "discard") {
  if (!room.game) return { error: "No game." };
  const seat = room.seats[seatIdx];
  if (!seat) return { error: "No seat." };

  if (source === "stock") {
    const card = room.game.deck.pop();
    if (!card) return { error: "Deck empty." };
    seat.hand.push(card);
  } else {
    if (!room.game.discardTop) return { error: "Discard empty." };
    seat.hand.push(room.game.discardTop);
    room.game.discard.pop();
    room.game.discardTop = room.game.discard.length > 0 ? room.game.discard[room.game.discard.length - 1] : null;
  }

  room.game.turnPhase = "discard";
  room.game.turnStartedAt = Date.now();
  return { ok: true };
}

export function applyDiscard(room: Room, seatIdx: number, cardId: string) {
  if (!room.game) return { error: "No game." };
  const seat = room.seats[seatIdx];
  if (!seat) return { error: "No seat." };

  const idx = seat.hand.indexOf(cardId);
  if (idx === -1) return { error: "Card not in hand." };

  seat.hand.splice(idx, 1);
  room.game.discard.push(cardId);
  room.game.discardTop = cardId;

  // Pass turn clockwise
  const activeIndices = room.seats.map((s, i) => (s && !s.eliminated ? i : -1)).filter((i) => i !== -1);
  let nextIdx = activeIndices.findIndex((i) => i === seatIdx) + 1;
  if (nextIdx >= activeIndices.length) nextIdx = 0;

  room.game.turnIdx = activeIndices[nextIdx];
  room.game.turnPhase = "draw";
  room.game.turnStartedAt = Date.now();

  return { ok: true };
}

export function applyGin(room: Room, seatIdx: number, cardId: string) {
  if (!room.game) return { error: "No game." };
  const seat = room.seats[seatIdx];
  if (!seat) return { error: "No seat." };

  const idx = seat.hand.indexOf(cardId);
  if (idx !== -1) seat.hand.splice(idx, 1);

  room.game.matchOver = true;
  room.game.matchWinnerIdx = seatIdx;
  return { ok: true };
}
