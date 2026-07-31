import { Room, SeatState, ClientGameState, HouseRules } from "./types";

const RECONNECT_WINDOW_MS = 60_000;

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

export function tryJoinRoom(
  room: Room,
  nickname: string,
  clientId: string,
  password?: string,
  team?: 1 | 2
): { ok: boolean; seatIdx?: number; error?: string } {
  if (room.visibility === "private" && room.passwordHash) {
    if (password !== room.passwordHash) {
      return { ok: false, error: "Incorrect password." };
    }
  }

  // Check if player is reconnecting to an existing seat
  const existingIdx = room.seats.findIndex((s) => s?.clientId === clientId);
  if (existingIdx !== -1) {
    const seat = room.seats[existingIdx]!;
    seat.connected = true;
    seat.lastSeenAt = Date.now();
    seat.nickname = nickname;
    if (team) seat.team = team;
    return { ok: true, seatIdx: existingIdx };
  }

  if (room.status !== "waiting") {
    return { ok: false, error: "Game already in progress." };
  }

  const freeIdx = room.seats.findIndex((s) => s === null);
  if (freeIdx === -1) {
    return { ok: false, error: "Room is full." };
  }

  room.seats[freeIdx] = {
    nickname,
    clientId,
    connected: true,
    lastSeenAt: Date.now(),
    ready: false,
    hand: [],
    score: 0,
    eliminated: false,
    team: room.rules.teamMode === "2v2" ? team || 1 : undefined,
  };

  addSystemMessage(room, `${nickname} joined the room.`);
  return { ok: true, seatIdx: freeIdx };
}

export function markLeft(room: Room, clientId: string) {
  const idx = room.seats.findIndex((s) => s?.clientId === clientId);
  if (idx === -1) return;

  if (room.status === "waiting") {
    const nick = room.seats[idx]?.nickname;
    room.seats[idx] = null;
    if (nick) addSystemMessage(room, `${nick} left the room.`);
  } else {
    const seat = room.seats[idx];
    if (seat) {
      seat.connected = false;
      seat.lastSeenAt = Date.now();
    }
  }
}

export function canStart(room: Room, clientId: string): { ok: boolean; error?: string } {
  if (room.hostClientId !== clientId) {
    return { ok: false, error: "Only the host can start the game." };
  }
  const activeSeats = room.seats.filter((s) => s !== null);
  if (activeSeats.length < 2) {
    return { ok: false, error: "Need at least 2 players to start." };
  }
  if (!activeSeats.every((s) => s?.ready)) {
    return { ok: false, error: "All players must be ready." };
  }
  return { ok: true };
}

export function startGame(room: Room) {
  room.status = "playing";
  initializeGame(room);
  addSystemMessage(room, "The match has started!");
}

export function initializeGame(room: Room) {
  const mode = room.rules.gameMode;
  
  if (mode === "cicmic") {
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

    const tablePile = deck.splice(0, 4);

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

  // Zhol setup
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

export function isSeatExpired(seat: SeatState): boolean {
  return !seat.connected && Date.now() - seat.lastSeenAt > RECONNECT_WINDOW_MS;
}

export function redactRoomForClient(room: Room) {
  const { passwordHash, ...rest } = room;
  return rest;
}

export function toClientGameState(room: Room, yourSeat: number | null): ClientGameState | null {
  if (!room.game) return null;

  const yourHand = yourSeat !== null && room.seats[yourSeat] ? room.seats[yourSeat]!.hand : [];
  const opponents = room.seats
    .map((s, idx) => {
      if (idx === yourSeat || !s) return null;
      return {
        seatIdx: idx,
        nickname: s.nickname,
        connected: s.connected,
        cardCount: s.hand.length,
        score: s.score,
        eliminated: s.eliminated,
        team: s.team,
      };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null);

  return {
    roundNumber: room.game.roundNumber,
    turnIdx: room.game.turnIdx,
    turnPhase: room.game.turnPhase,
    turnStartedAt: room.game.turnStartedAt,
    turnTimerSeconds: room.rules.turnTimerSeconds,
    deck: room.game.deck,
    discard: room.game.discard,
    discardTop: room.game.discardTop,
    yourHand,
    opponents,
    matchOver: room.game.matchOver,
    matchWinnerIdx: room.game.matchWinnerIdx,
    lastRoundEnd: room.game.lastRoundEnd,
    tablePile: room.game.tablePile,
    board: room.game.board,
    pendingRemoval: room.game.pendingRemoval,
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
