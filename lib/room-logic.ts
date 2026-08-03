import { Room, SeatState, ClientGameState, HouseRules, GinType } from "./types";
import { freshDeckIds, minimizeDeadwood, isJokerId, makeCard } from "./gin-engine";

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
    zholMode?: "classic" | "free_play";
    teamMode?: "1v1" | "2v2" | "free";
    turnTimerSeconds?: number;
    eliminationScore: number;
  };
}): Room {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const seats: (SeatState | null)[] = Array(opts.maxPlayers).fill(null);

  const isFreePlay = opts.rules.gameMode === "zhol" && opts.rules.zholMode === "free_play";

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
    game: null,
    rules: {
      gameMode: opts.rules.gameMode,
      zholMode: opts.rules.zholMode,
      teamMode: opts.rules.teamMode,
      ginBonuses: { gin: 25, bigGin: 50, superGin: 100 },
      eliminationScore: isFreePlay ? 0 : opts.rules.eliminationScore,
      turnTimerSeconds: 0, // Turn timer disabled
      jokerCount: 2,
      allowEliminations: !isFreePlay,
    },
    systemMessages: [`Room ${code} created by ${opts.hostNickname}.`],
    chat: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function addSystemMessage(room: Room, msg: string) {
  room.systemMessages.push(msg);
  if (room.systemMessages.length > 50) room.systemMessages.shift();
  room.updatedAt = Date.now();
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
      unplacedPieces: { 1: 9, 2: 9 },
      pendingRemoval: false,
    };
    return;
  }

  if (mode === "pishpirik") {
    const deck = generateStandardDeck();
    shuffle(deck);

    const tablePile = deck.splice(0, 4);

    const activeSeatIndices = room.seats.map((s, i) => (s ? i : -1)).filter((i) => i !== -1);
    const dealerIdx = activeSeatIndices[Math.floor(Math.random() * activeSeatIndices.length)];

    room.seats.forEach((seat) => {
      if (seat) {
        seat.hand = deck.splice(0, 4);
      }
    });

    room.game = {
      roundNumber: 1,
      turnIdx: dealerIdx,
      turnPhase: "discard",
      turnStartedAt: Date.now(),
      turnTimerSeconds: room.rules.turnTimerSeconds,
      deck,
      discard: [],
      discardTop: null,
      dealerIdx,
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
    turnPhase: "discard", // Starter gets 11 cards, must discard first
    turnStartedAt: Date.now(),
    turnTimerSeconds: 0,
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
    yourSeat: yourSeat ?? -1,
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
    dealerIdx: room.game.dealerIdx,
    tablePile: room.game.tablePile,
    capturedBySeat: room.game.capturedBySeat,
    pishpiriksBySeat: room.game.pishpiriksBySeat,
    board: room.game.board,
    unplacedPieces: room.game.unplacedPieces,
    piecesOnBoard: room.game.piecesOnBoard,
    cicmicPhase: room.game.cicmicPhase,
    pendingRemoval: room.game.pendingRemoval,
  };
}

function generateStandardDeck(): string[] {
  return freshDeckIds(1, 0);
}

function generateZholDeck(playerCount: number): string[] {
  if (playerCount <= 2) return freshDeckIds(1, 2);
  return freshDeckIds(2, 4);
}

function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
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

export function startNextRound(room: Room) {
  if (!room.game) return;

  const mode = room.rules.gameMode;
  const activeSeats = room.seats
    .map((s, i) => (s && !s.eliminated ? i : -1))
    .filter((i) => i !== -1);

  if (mode === "zhol") {
    const deck = generateZholDeck(activeSeats.length);
    shuffle(deck);

    // Rotate starter seat clockwise among remaining active players
    let nextStarter = activeSeats.indexOf(room.game.turnIdx) + 1;
    if (nextStarter >= activeSeats.length || nextStarter === -1) nextStarter = 0;
    const starterSeat = activeSeats[nextStarter];

    activeSeats.forEach((seatIdx) => {
      const count = seatIdx === starterSeat ? 11 : 10;
      room.seats[seatIdx]!.hand = deck.splice(0, count);
    });

    const topDiscard = deck.pop() || null;

    room.game = {
      roundNumber: room.game.roundNumber + 1,
      turnIdx: starterSeat,
      turnPhase: "discard", // Starter gets 11 cards, must discard first
      turnStartedAt: Date.now(),
      turnTimerSeconds: 0,
      deck,
      discard: topDiscard ? [topDiscard] : [],
      discardTop: topDiscard,
      matchOver: false,
    };
  }
}

export function applyGin(room: Room, seatIdx: number, cardId: string) {
  if (!room.game) return { error: "No game." };
  const winnerSeat = room.seats[seatIdx];
  if (!winnerSeat) return { error: "No seat." };

  // Remove the discarded card from hand
  const idx = winnerSeat.hand.indexOf(cardId);
  if (idx !== -1) winnerSeat.hand.splice(idx, 1);

  // --- 1. DETERMINE ZHOL BONUS TYPE ---
  const isJokerDiscard = isJokerId(cardId);
  
  // Are all remaining 10 cards the same suit? (Jokers act as wild and adapt)
  const handCards = winnerSeat.hand.map(makeCard);
  const nonJokers = handCards.filter(c => !c.isJoker);
  const firstSuit = nonJokers.length > 0 ? nonJokers[0].suit : null;
  const isSuitGin = nonJokers.length > 0 && nonJokers.every(c => c.suit === firstSuit);

  let winBonus = 10; // Default Zhol Bonus
  let ginType: GinType = "normal_gin";

  if (isSuitGin && isJokerDiscard) {
    winBonus = 50;
    ginType = "suit_joker_gin";
  } else if (isSuitGin && !isJokerDiscard) {
    winBonus = 25;
    ginType = "suit_gin";
  } else if (!isSuitGin && isJokerDiscard) {
    winBonus = 20;
    ginType = "joker_gin";
  }

  // --- 2. CALCULATE DEADWOOD & UPDATE SCORES ---
  const pointsBySeat: any[] = [];

  room.seats.forEach((seat, i) => {
    if (!seat || seat.eliminated) return;

    let deadwood = 0;
    let deadCards: string[] = [];

    if (i === seatIdx) {
      seat.score -= winBonus; // Winner subtracts bonus points
    } else {
      const res = minimizeDeadwood(seat.hand);
      deadwood = res.deadwood;
      deadCards = res.deadCards;
      seat.score += deadwood; // Non-winners add deadwood
    }

    // Eliminate player if score exceeds threshold in Classic mode
    if (room.rules.allowEliminations && seat.score >= room.rules.eliminationScore) {
      seat.eliminated = true;
      addSystemMessage(room, `${seat.nickname} has been eliminated!`);
    }

    pointsBySeat.push({
      seatIdx: i,
      deadwood,
      deadCards,
      eliminated: seat.eliminated
    });
  });

  // --- 3. POPULATE ROUND REVEAL DATA ---
  const winnerRes = minimizeDeadwood(winnerSeat.hand);
  room.game.lastRoundEnd = {
    type: ginType,
    winnerIdx: seatIdx,
    winnerMelds: winnerRes.melds,
    winnerBonus: winBonus,
    pointsBySeat
  };

  // Pause the game on "round_over" so the animation and counting can play
  room.game.turnPhase = "round_over";

  // --- 4. CHECK MATCH OVER CONDITION ---
  const remainingSeats = room.seats
    .map((s, i) => (s && !s.eliminated ? i : -1))
    .filter((i) => i !== -1);

  if (room.rules.allowEliminations && remainingSeats.length <= 1) {
    const finalWinnerIdx = remainingSeats.length === 1 ? remainingSeats[0] : seatIdx;
    room.game.matchOver = true;
    room.game.matchWinnerIdx = finalWinnerIdx;
    room.status = "finished";
    
    const finalWinner = room.seats[finalWinnerIdx];
    addSystemMessage(room, `Match over! ${finalWinner?.nickname || winnerSeat.nickname} wins!`);
  } else {
    addSystemMessage(room, `${winnerSeat.nickname} declared Zhol! (-${winBonus} pts)`);
  }

  return { ok: true };
}
