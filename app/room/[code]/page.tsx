"use client";

import { useEffect, useMemo, useRef, useState, forwardRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { getNickname, getClientId, addRecentRoom, removeRecentRoom } from "@/lib/client-id";
import { useLiveData } from "@/lib/use-live-data";
import { roomChannel, EVENTS } from "@/lib/pusher";
import type { Room, ClientGameState } from "@/lib/types";
import { minimizeDeadwood, canGin, findGinDiscard, resolveJokerPlaceholders, isJokerId } from "@/lib/gin-engine";
import PlayingCard from "@/components/PlayingCard";
import HandFan from "@/components/HandFan";
import OpponentFan from "@/components/OpponentFan";
import TurnTimer from "@/components/TurnTimer";
import DealAnimation, { type DealTarget } from "@/components/DealAnimation";
import ScoreBadge from "@/components/ScoreBadge";
import RoundEndReveal from "@/components/RoundEndReveal";

interface StateResponse {
  room: Omit<Room, "passwordHash">;
  yourSeat: number | null;
  game: ClientGameState | null;
}

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code || "").toUpperCase();
  const router = useRouter();
  const [nickname, setNicknameState] = useState("");
  const [clientId, setClientId] = useState("");
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [joining, setJoining] = useState(false);
  const [hasJoined, setHasJoined] = useState(false); // Add this line
  
  useEffect(() => {
    const n = getNickname();
    if (!n) {
      router.replace("/");
      return;
    }
    setNicknameState(n);
    setClientId(getClientId());
  }, [router]);

  const { data, error } = useLiveData<StateResponse>(
    clientId ? `/api/rooms/${code}/state?clientId=${clientId}` : null,
    roomChannel(code),
    EVENTS.ROOM_UPDATED,
    2500
  );

  useEffect(() => {
    if (!data || !nickname || !clientId) return;
    
    // If we have a seat, mark that we successfully joined
    if (data.yourSeat !== null) {
      if (!hasJoined) setHasJoined(true);
      return;
    }

    // If we PREVIOUSLY had a seat but now don't, we were kicked!
    if (hasJoined && data.yourSeat === null) {
      alert("You have been kicked from the room.");
      removeRecentRoom(code); // Wipe from local memory
      router.push("/lobby");
      return;
    }

    if (data.room.status !== "waiting") return;
    if (data.room.seats.every(Boolean)) return;
    if (joining) return;

    setJoining(true);
    fetch(`/api/rooms/${code}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, clientId }),
    }).finally(() => setJoining(false));
  }, [data, nickname, clientId, code, joining, hasJoined, router]);

  useEffect(() => {
    if (data && data.room) {
      addRecentRoom(code);
    }
  }, [data, code]);

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg text-white/70">{error}</p>
        <button onClick={() => router.push("/lobby")} className="glow-blue rounded-xl bg-gradient-to-r from-neon-blue to-neon-purple px-6 py-2.5 font-bold text-black">
          Back to Lobby
        </button>
      </main>
    );
  }

  if (!data) {
    return <main className="flex min-h-screen items-center justify-center text-white/40">Loading table...</main>;
  }

  const { room, yourSeat, game } = data;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6">
      <RoomHeader room={room} clientId={clientId} />
      {room.status === "waiting" && <WaitingRoom room={room} yourSeat={yourSeat} clientId={clientId} code={code} />}
      {room.status !== "waiting" && game && yourSeat !== null && (
        <GameBoard
          room={room}
          game={game}
          yourSeat={yourSeat}
          code={code}
          selectedCard={selectedCard}
          setSelectedCard={setSelectedCard}
          actionError={actionError}
          setActionError={setActionError}
        />
      )}
    </main>
  );
}

function RoomHeader({ room, clientId }: { room: Omit<Room, "passwordHash">; clientId: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const isHost = room.hostClientId === clientId;

  function copy(kind: "code" | "link") {
    const text = kind === "code" ? room.code : `${window.location.origin}/room/${room.code}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  async function handleDeleteRoom() {
    if (!confirm("Are you sure you want to completely delete this room? This will kick everyone out.")) return;
    removeRecentRoom(room.code);
    await fetch(`/api/rooms/${room.code}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    router.push("/lobby");
  }

  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-neon-blue-soft">{room.name}</div>
        <h1 className="text-2xl font-black text-glow-purple">Room {room.code}</h1>
      </div>
      <div className="flex gap-2">
        {isHost && (
          <button 
            onClick={handleDeleteRoom} 
            className="glass rounded-lg border-neon-pink/40 px-3 py-2 text-xs font-semibold text-neon-pink hover:bg-neon-pink/10 transition"
          >
            Delete Room
          </button>
        )}
        <button onClick={() => copy("code")} className="glass rounded-lg px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10">
          {copied === "code" ? "Copied!" : "Copy Code"}
        </button>
        <button onClick={() => copy("link")} className="glass rounded-lg px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10">
          {copied === "link" ? "Copied!" : "Copy Invite Link"}
        </button>
      </div>
    </header>
  );
}

function WaitingRoom({ room, yourSeat, clientId, code }: { room: Omit<Room, "passwordHash">; yourSeat: number | null; clientId: string; code: string; }) {
  const router = useRouter();
  const isHost = room.hostClientId === clientId;

  const occupied = room.seats.filter(Boolean);
  const bothReady = occupied.every((s) => s?.ready);
  const enoughPlayers = occupied.length >= 2;

  const you = yourSeat !== null ? room.seats[yourSeat] : null;

  async function leave() {
    removeRecentRoom(code);
    await fetch(`/api/rooms/${code}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    router.push("/lobby");
  }

  // ADD THIS FUNCTION
  async function kickPlayer(targetClientId: string) {
    if (!confirm("Are you sure you want to kick this player?")) return;
    await fetch(`/api/rooms/${code}/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, targetClientId }),
    });
  }

  async function toggleReady() {
    await fetch(`/api/rooms/${code}/ready`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, ready: !you?.ready }),
    });
  }

  async function startGame() {
    await fetch(`/api/rooms/${code}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
  }
  
  return (
    <div className="glass glow-purple rounded-2xl p-6">
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {room.seats.map((seat, i) => (
          <div key={i} className={`rounded-xl border p-5 text-center ${seat?.ready ? "border-neon-blue/50 bg-neon-blue/5" : "border-white/10"}`}>
            <div className="mb-1 text-xs uppercase tracking-wider text-white/40">
              {i === 0 ? "Host" : `Seat ${i + 1}`}
            </div>
            {seat ? (
              <>
                <div className="text-lg font-bold text-white">{seat.nickname}</div>
                <div className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${seat.ready ? "bg-neon-blue/20 text-neon-blue-soft" : "bg-white/10 text-white/40"}`}>
                  {seat.ready ? "Ready" : "Not ready"}
                </div>
                
                {/* ADD THE KICK BUTTON HERE */}
                {isHost && seat.clientId !== clientId && (
                  <button
                    onClick={() => kickPlayer(seat.clientId)}
                    className="mt-3 block w-full rounded-lg bg-neon-pink/20 py-1.5 text-xs font-bold text-neon-pink transition hover:bg-neon-pink/30"
                  >
                    Kick
                  </button>
                )}
              </>
            ) : (
              <div className="py-2 text-white/30">Open seat</div>
            )}
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-xs text-white/50">
        <span className="glass rounded-full px-3 py-1">Out at {room.rules.eliminationScore} pts</span>
        <span className="glass rounded-full px-3 py-1">
          Timer: {room.rules.turnTimerSeconds ? `${room.rules.turnTimerSeconds}s` : "Off"}
        </span>
        <span className="glass rounded-full px-3 py-1">Gin only — no knock</span>
        <span className="glass rounded-full px-3 py-1">
          {room.maxPlayers >= 3 ? "2 decks + 2 jokers" : "1 deck + 2 jokers"}
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        {yourSeat !== null && (
          <button
            onClick={toggleReady}
            className={`rounded-xl px-6 py-2.5 font-bold transition ${
              you?.ready ? "bg-white/10 text-white/70" : "glow-blue bg-gradient-to-r from-neon-blue to-neon-purple text-black"
            }`}
          >
            {you?.ready ? "Not Ready" : "I'm Ready"}
          </button>
        )}
        {isHost && (
          <button
            onClick={startGame}
            disabled={!enoughPlayers || !bothReady}
            className="glow-purple rounded-xl bg-gradient-to-r from-neon-purple to-neon-pink px-6 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            Start Game
          </button>
        )}

        <button onClick={leave} className="ml-auto rounded-xl border border-white/10 px-6 py-2.5 font-semibold text-white/60 hover:bg-white/5">
          Leave Room
        </button>
      </div>
    </div>
  );
}

function GameBoard({
  room,
  game,
  yourSeat,
  code,
  selectedCard,
  setSelectedCard,
  actionError,
  setActionError,
}: {
  room: Omit<Room, "passwordHash">;
  game: ClientGameState;
  yourSeat: number;
  code: string;
  selectedCard: string | null;
  setSelectedCard: (c: string | null) => void;
  actionError: string;
  setActionError: (e: string) => void;
}) {
  const router = useRouter();
  const clientId = getClientId();
  const you = room.seats[yourSeat];
  const [dropX, setDropX] = useState<number | null>(null);

  // OPTIMISTIC UI STATE
  const [optimisticGame, setOptimisticGame] = useState<ClientGameState | null>(null);
  
  // Sync the optimistic state with the server whenever the server provides a new confirmed state
  useEffect(() => {
    setOptimisticGame(game);
  }, [game]);

  const displayGame = optimisticGame || game;

  const discardRef = useRef<HTMLDivElement>(null);
  const ginRef = useRef<HTMLButtonElement>(null);

  const isYourTurn = displayGame.turnIdx === yourSeat && !displayGame.matchOver;
  const canAct = isYourTurn && displayGame.turnPhase === "discard";

  // Filter out any optimistic placeholder cards before passing hand to the engine
  const playableHand = displayGame.yourHand.filter((id) => id !== "__DRAWING__");

  const deadwoodInfo = useMemo(() => minimizeDeadwood(playableHand), [playableHand]);
  const jokersInHand = useMemo(() => playableHand.filter(isJokerId), [playableHand]);

  const resolvedMelds = useMemo(
    () => resolveJokerPlaceholders(deadwoodInfo.melds, jokersInHand),
    [deadwoodInfo, jokersInHand]
  );

  const meldIndexByCard = useMemo(() => {
    const map: Record<string, number> = {};
    resolvedMelds.forEach((m, idx) => m.cards.forEach((c) => (map[c] = idx)));
    return map;
  }, [resolvedMelds]);

  async function sendMove(body: Record<string, unknown>) {
    setActionError("");

    // --- APPLY OPTIMISTIC STATE MUTATION ---
    const next = { ...displayGame };
    const action = body.action as string;
    const cardId = body.cardId as string;
    const source = body.source as string;

    if (action === "discard" || action === "gin") {
      next.yourHand = next.yourHand.filter((c) => c !== cardId);
      next.discard = [...next.discard, cardId];
      next.discardTop = cardId;
      next.turnPhase = action === "gin" ? "round_over" : "draw";
      if (action === "discard") {
        next.turnIdx = -1; // Instantly drop the 'Your Turn' badge
      }
    } else if (action === "draw" && source === "discard") {
      if (next.discardTop) {
        next.yourHand = [...next.yourHand, next.discardTop];
        next.discard = next.discard.slice(0, -1);
        next.discardTop = next.discard.length > 0 ? next.discard[next.discard.length - 1] : null;
      }
      next.turnPhase = "discard";
    } else if (action === "draw" && source === "stock") {
      next.deckCount = Math.max(0, next.deckCount - 1);
      next.yourHand = [...next.yourHand, "__DRAWING__"]; // Inject placeholder so hand fans out immediately
      next.turnPhase = "discard";
    }

    setOptimisticGame(next);
    setSelectedCard(null);
    // --- END OPTIMISTIC UI ---

    const res = await fetch(`/api/rooms/${code}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, ...body }),
    });
    const json = await res.json();
    if (!res.ok) {
      setActionError(json.error || "Move failed.");
      setOptimisticGame(game); // rollback on error
    }
  }

  async function leave() {
    removeRecentRoom(code);
    await fetch(`/api/rooms/${code}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    router.push("/lobby");
  }

  async function leave() {
    removeRecentRoom(code);
    await fetch(`/api/rooms/${code}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    router.push("/lobby");
  }

  // --- ADD THESE LINES ---
  const isHost = room.hostClientId === clientId;

  async function kickPlayer(targetClientId: string) {
    if (!confirm("Are you sure you want to kick this player?")) return;
    await fetch(`/api/rooms/${code}/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, targetClientId }),
    });
  }
  // -----------------------

  const handleDragEnd = (cardId: string, info: PanInfo) => {
    if (!canAct) return;
    const { x, y } = info.point;

    const checkZone = (ref: React.RefObject<any>) => {
      if (!ref.current) return false;
      const rect = ref.current.getBoundingClientRect();
      return x >= rect.left - 20 && x <= rect.right + 20 && y >= rect.top - 20 && y <= rect.bottom + 20;
    };

    const achievesGin = canGin(playableHand.filter((c) => c !== cardId));

    if (checkZone(ginRef)) {
      if (achievesGin) {
        sendMove({ action: "gin", cardId });
      } else {
        setActionError("That card does not result in a valid Gin.");
      }
    } else if (checkZone(discardRef) || info.offset.y < -150) {
      if (achievesGin) {
        sendMove({ action: "gin", cardId });
      } else {
        sendMove({ action: "discard", cardId });
      }
    }
  };

  const autoGinDiscard = useMemo(
    () => (canAct && playableHand.length === 11 ? findGinDiscard(playableHand) : null),
    [canAct, playableHand]
  );
  const selectedAchievesGin = canAct && !!selectedCard && canGin(playableHand.filter((c) => c !== selectedCard));
  const ginDiscardCard = selectedAchievesGin ? selectedCard : autoGinDiscard;
  const canDeclareGin = canAct && !!ginDiscardCard;

  const activeOpponents = displayGame.opponents.filter((o) => !o.eliminated);
  const turnPlayerName = displayGame.turnIdx === yourSeat ? "you" : room.seats[displayGame.turnIdx]?.nickname ?? "opponent";

  const prevRoundRef = useRef<number | null>(null);
  const [dealState, setDealState] = useState<{ round: number; targets: DealTarget[] } | null>(null);
  const [showingScore, setShowingScore] = useState(false);

  useEffect(() => {
    if (prevRoundRef.current === null || displayGame.roundNumber !== prevRoundRef.current) {
      const isFirstLoad = prevRoundRef.current === null;
      prevRoundRef.current = displayGame.roundNumber;

      const activeSeatIndices = room.seats
        .map((s, i) => (s && !s.eliminated ? i : -1))
        .filter((i) => i !== -1);
      const starterSeat =
        activeSeatIndices.length > 0 ? activeSeatIndices[displayGame.roundNumber % activeSeatIndices.length] : yourSeat;

      const targets: DealTarget[] = [
        { seatIdx: yourSeat, nickname: you?.nickname ?? "You", isYou: true, finalCount: yourSeat === starterSeat ? 11 : 10 },
        ...displayGame.opponents
          .filter((o) => !o.eliminated)
          .map((o) => ({
            seatIdx: o.seatIdx,
            nickname: o.nickname,
            isYou: false,
            finalCount: o.seatIdx === starterSeat ? 11 : 10,
          })),
      ];

      if (!isFirstLoad && displayGame.lastRoundEnd) {
        setShowingScore(true);
        const timer = setTimeout(() => {
          setShowingScore(false);
          if (!displayGame.matchOver) {
            setDealState({ round: displayGame.roundNumber, targets });
          }
        }, 5000);
        return () => clearTimeout(timer);
      } else {
        setShowingScore(false);
        if (!displayGame.matchOver) {
          setDealState({ round: displayGame.roundNumber, targets });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayGame.roundNumber]);

  return (
    <div className="relative space-y-4">
      <AnimatePresence>
        {dealState && dealState.round === displayGame.roundNumber && (
          <DealAnimation targets={dealState.targets} onComplete={() => setDealState(null)} />
        )}
      </AnimatePresence>

      <div className="relative h-48 sm:h-56">
        {displayGame.opponents.map((opp, i) => {
          const pos = seatPosition(i, displayGame.opponents.length);
          const oppClientId = room.seats[opp.seatIdx]?.clientId; // Grab their ID

          return (
            <div
              key={opp.seatIdx}
              className="absolute -translate-x-1/2 -translate-y-1/2 space-y-1"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <PlayerStrip
                nickname={opp.nickname}
                connected={opp.connected}
                cardCount={opp.cardCount}
                score={opp.score}
                eliminated={opp.eliminated}
                isTurn={displayGame.turnIdx === opp.seatIdx}
                faceDown
              />
              
              {/* --- KICK BUTTON FOR HOST --- */}
              {isHost && oppClientId && (
                <button
                  onClick={() => kickPlayer(oppClientId)}
                  className="mx-auto block w-3/4 rounded bg-neon-pink/20 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neon-pink transition hover:bg-neon-pink/30"
                >
                  Kick
                </button>
              )}

              {!opp.eliminated && (
                <div className="flex justify-center">
                  <OpponentFan count={showingScore ? 0 : opp.cardCount} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="felt-table relative rounded-3xl p-6">
        <div className="flex items-center justify-between">
          <div className="text-xs text-white/50">
            Round {displayGame.roundNumber} • Elimination at {room.rules.eliminationScore} • {activeOpponents.length + 1} still in
          </div>
          <TurnTimer startedAt={displayGame.turnStartedAt} seconds={displayGame.turnTimerSeconds} active={!displayGame.matchOver} />
        </div>

        <div className={`flex items-center justify-center gap-10 py-10 transition-opacity duration-500 ${showingScore ? "opacity-0" : "opacity-100"}`} ref={discardRef}>
          
          <div className="flex items-center justify-center gap-6 sm:gap-12">
            {/* Stock Pile */}
            <div className="relative">
              {displayGame.deckCount > 1 && <div className="absolute -left-1.5 -top-1.5 opacity-50"><PlayingCard id={null} faceDown /></div>}
              {displayGame.deckCount > 2 && <div className="absolute -left-0.5 -top-0.5 opacity-80"><PlayingCard id={null} faceDown /></div>}
              
              <motion.button
                drag={isYourTurn && displayGame.turnPhase === "draw" ? true : false}
                dragSnapToOrigin
                whileDrag={{ scale: 1.05, zIndex: 50 }}
                onDragEnd={(e, info) => {
                  if (info.offset.y > 60) {
                    setDropX(info.point.x); // Required for exact drop placement!
                    sendMove({ action: "draw", source: "stock" });
                  }
                }}
                disabled={!isYourTurn || displayGame.turnPhase !== "draw"}
                onClick={() => {
                  setDropX(null); 
                  sendMove({ action: "draw", source: "stock" });
                }}
                className="relative z-10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {/* THIS IS THE CRITICAL LINE THAT MAKES IT FLY */}
                <PlayingCard 
                  id={null} 
                  faceDown 
                  layoutId={isYourTurn && displayGame.turnPhase === "draw" ? "card-__DRAWING__" : undefined} 
                />
                
                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                  {displayGame.deckCount}
                </span>
              </motion.button>
            </div>

            {/* Discard Pile */}
            <div className="relative">
              <motion.button
                drag={isYourTurn && displayGame.turnPhase === "draw" && displayGame.discardTop ? true : false}
                dragSnapToOrigin
                whileDrag={{ scale: 1.05, zIndex: 50 }}
                onDragEnd={(e, info) => {
                  if (info.offset.y > 60) {
                    setDropX(info.point.x); // Remember where it was dropped
                    sendMove({ action: "draw", source: "discard" });
                  }
                }}
                disabled={!isYourTurn || displayGame.turnPhase !== "draw" || !displayGame.discardTop}
                onClick={() => {
                  setDropX(null);
                  sendMove({ action: "draw", source: "discard" });
                }}
                className="relative z-10 disabled:cursor-not-allowed"
              >
                {displayGame.discardTop ? (
                  <PlayingCard id={displayGame.discardTop} layoutId={`card-${displayGame.discardTop}`} />
                ) : (
                  <div className="h-24 w-16 rounded-lg border border-dashed border-white/15 bg-black/10 sm:h-28 sm:w-[4.5rem]" />
                )}
              </motion.button>
            </div>
          </div>

          {displayGame.discard.length > 1 && (
            <div className="hidden items-end sm:flex" style={{ height: "7rem" }}>
              {displayGame.discard.slice(0, -1).slice(-4).map((id, i, arr) => (
                <div
                  key={id + i}
                  style={{ marginLeft: i === 0 ? 0 : -40, transform: `rotate(${(i - arr.length / 2) * 3}deg)`, opacity: 0.55 }}
                >
                  <PlayingCard id={id} small />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`text-center text-xs uppercase tracking-wider text-white/30 transition-opacity duration-500 ${showingScore ? "opacity-0" : "opacity-100"}`}>
          Draw Deck • Face-up Draw Card • Discard Pile 
        </div>

        <div className={`mt-2 text-center text-sm font-semibold transition-opacity duration-500 ${showingScore ? "opacity-0" : "opacity-100"}`}>
          {displayGame.matchOver ? (
            <span className="text-neon-purple-soft">Match complete</span>
          ) : isYourTurn ? (
            <span className="animate-pulse-glow rounded-full bg-neon-blue/10 px-4 py-1 text-neon-blue-soft">
              Your turn — {displayGame.turnPhase === "draw" ? "draw a card" : "discard or declare Gin"}
            </span>
          ) : (
            <span className="text-white/40">Waiting for {turnPlayerName}...</span>
          )}
        </div>

        {actionError && <p className="mt-2 text-center text-sm text-neon-pink">{actionError}</p>}

        <AnimatePresence>
          {showingScore && displayGame.lastRoundEnd && <RoundEndReveal info={displayGame.lastRoundEnd} room={room} roundKey={displayGame.roundNumber} />}
        </AnimatePresence>

        <AnimatePresence>
          {displayGame.matchOver && !showingScore && <WinOverlay game={displayGame} room={room} onExit={leave} />}
        </AnimatePresence>
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-white/70">
            Your hand — Deadwood:{" "}
            <span className={deadwoodInfo.deadwood === 0 ? "text-neon-blue-soft" : "text-white"}>{deadwoodInfo.deadwood}</span>
          </span>
          <div className="flex flex-wrap gap-2">
            <ActionButton ref={ginRef} disabled={!canDeclareGin} onClick={() => sendMove({ action: "gin", cardId: ginDiscardCard || "" })} variant="purple">
              Zhol! (Gin)
            </ActionButton>
            <ActionButton disabled={!canAct || !selectedCard} onClick={() => sendMove({ action: "discard", cardId: selectedCard || "" })} variant="ghost">
              Discard
            </ActionButton>
          </div>
        </div>

        <HandFan
          cards={showingScore ? [] : displayGame.yourHand}
          selectedCard={selectedCard}
          onSelect={(id) => canAct && setSelectedCard(selectedCard === id ? null : id)}
          interactive={canAct && !showingScore}
          meldIndexByCard={meldIndexByCard}
          onDragEnd={handleDragEnd}
          insertAtX={dropX} // Pass the remembered drop location!
        />
      </div>

      <PlayerStrip
        nickname={you?.nickname ?? "You"}
        connected={!!you?.connected}
        cardCount={displayGame.yourHand.length}
        score={you?.score ?? 0}
        eliminated={you?.eliminated ?? false}
        isTurn={displayGame.turnIdx === yourSeat}
      />
    </div>
  );
}

function seatPosition(index: number, opponentCount: number): { x: number; y: number } {
  const totalSeats = opponentCount + 1;
  const angleStep = 360 / totalSeats;
  const angleDeg = 90 + angleStep * (index + 1);
  const rad = (angleDeg * Math.PI) / 180;
  return { x: 50 + 42 * Math.cos(rad), y: 50 + 40 * Math.sin(rad) };
}

const ActionButton = forwardRef<
  HTMLButtonElement,
  {
    children: React.ReactNode;
    disabled?: boolean;
    onClick: () => void;
    variant: "blue" | "purple" | "pink" | "ghost";
  }
>(({ children, disabled, onClick, variant }, ref) => {
  const styles = {
    blue: "bg-neon-blue/20 text-neon-blue-soft hover:bg-neon-blue/30",
    purple: "bg-neon-purple/20 text-neon-purple-soft hover:bg-neon-purple/30",
    pink: "bg-neon-pink/20 text-neon-pink hover:bg-neon-pink/30",
    ghost: "bg-white/10 text-white/80 hover:bg-white/20",
  }[variant];

  return (
    <button
      ref={ref}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-25 ${styles}`}
    >
      {children}
    </button>
  );
});
ActionButton.displayName = "ActionButton";

function PlayerStrip({
  nickname,
  connected,
  cardCount,
  score,
  eliminated,
  isTurn,
  faceDown,
}: {
  nickname: string;
  connected: boolean;
  cardCount: number;
  score: number;
  eliminated: boolean;
  isTurn: boolean;
  faceDown?: boolean;
}) {
  return (
    <div
      className={`glass flex items-center justify-between rounded-xl px-4 py-2.5 ${isTurn && !eliminated ? "ring-1 ring-neon-blue/50" : ""} ${
        eliminated ? "opacity-40 grayscale" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-neon-pink animate-pulse"}`} />
        <span className="font-bold text-white">{nickname}</span>
        {eliminated && <span className="text-xs text-neon-pink">eliminated</span>}
        {!eliminated && !connected && <span className="text-xs text-neon-pink">reconnecting...</span>}
        {faceDown && !eliminated && <span className="text-xs text-white/40">• {cardCount} cards</span>}
      </div>
      <ScoreBadge score={score} className="text-lg text-neon-blue-soft" />
    </div>
  );
}

function WinOverlay({ game, room, onExit }: { game: ClientGameState; room: Omit<Room, "passwordHash">; onExit: () => void }) {
  const winner = game.matchWinnerIdx !== undefined ? room.seats[game.matchWinnerIdx]?.nickname : "?";
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-3xl bg-black/70 backdrop-blur-md"
    >
      <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", bounce: 0.5 }} className="text-center">
        <div className="mb-1 text-xs uppercase tracking-[0.3em] text-neon-blue-soft">Match Over</div>
        <div className="text-4xl font-black text-glow-purple">{winner} Wins! 🏆</div>
        <div className="mt-2 space-y-0.5 text-sm text-white/60">
          {room.seats.filter(Boolean).map((s, i) => (
            <div key={i}>
              {s!.nickname}: {s!.score} pts {s!.eliminated ? "(eliminated)" : ""}
            </div>
          ))}
        </div>
      </motion.div>
      <button onClick={onExit} className="glow-blue rounded-xl bg-gradient-to-r from-neon-blue to-neon-purple px-6 py-2.5 font-bold text-black">
        Back to Lobby
      </button>
    </motion.div>
  );
}
