// Replace this function in lib/room-logic.ts

export function startNextRound(room: Room) {
  if (!room.game) return;

  const activeSeats = room.seats
    .map((s, i) => (s && !s.eliminated ? i : -1))
    .filter((i) => i !== -1);

  if (activeSeats.length === 0) return;

  // 1. Rotate the starting player clockwise based on active seats
  const currentStarter = room.game.dealerIdx ?? activeSeats[0];
  let nextStarterIndex = activeSeats.findIndex((i) => i === currentStarter) + 1;
  
  if (nextStarterIndex >= activeSeats.length) {
    nextStarterIndex = 0; // Wrap around to the first active player
  }
  
  const nextDealer = activeSeats[nextStarterIndex];
  
  // 2. Unify Round Reset logic
  room.game.turnIdx = nextDealer;
  room.game.dealerIdx = nextDealer;
  room.game.turnPhase = "discard";
  room.game.turnStartedAt = Date.now();
  
  room.game.tablePile = [];
  room.game.discard = [];
  room.game.discardTop = null;
  room.game.capturedBySeat = {};
  room.game.pishpiriksBySeat = {};
  room.game.lastRoundEnd = undefined;
  room.game.roundNumber += 1;

  // 3. Reset Deck and Hands
  if (room.rules.gameMode === "zhol") {
    room.game.deck = generateZholDeck(activeSeats.length);
  } else if (room.rules.gameMode === "pishpirik") {
    room.game.deck = generateStandardDeck();
  }
  shuffle(room.game.deck);

  room.seats.forEach(seat => {
    if (seat) seat.hand = [];
  });

  // 4. Deal fresh cards
  if (room.rules.gameMode === "pishpirik") {
    for (const i of activeSeats) {
      room.seats[i]!.hand = room.game.deck.splice(0, 4);
    }
    room.game.tablePile = room.game.deck.splice(0, 4);
  } else if (room.rules.gameMode === "zhol") {
    for (const i of activeSeats) {
      const isDealer = i === nextDealer;
      room.seats[i]!.hand = room.game.deck.splice(0, isDealer ? 11 : 10);
    }
    
    let topDiscard = null;
    for (let i = room.game.deck.length - 1; i >= 0; i--) {
      if (!isJokerId(room.game.deck[i])) {
        topDiscard = room.game.deck.splice(i, 1)[0];
        break;
      }
    }
    if (!topDiscard && room.game.deck.length > 0) topDiscard = room.game.deck.pop() || null;
    
    room.game.discard = topDiscard ? [topDiscard] : [];
    room.game.discardTop = topDiscard;
  }
}
