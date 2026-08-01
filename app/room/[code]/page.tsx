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
  const [hasJoined, setHasJoined] = useState(false);

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

    if (data.yourSeat !== null) {
      if (!hasJoined) setHasJoined(true);
      return;
    }

    if (hasJoined && data.yourSeat === null) {
      alert("You have been kicked from the room.");
      removeRecentRoom(code);
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
  const gameMode = room.rules.gameMode || "zhol";

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6">
      <RoomHeader room={room} clientId={clientId} />
      
      {room.status === "waiting" && <WaitingRoom room={room} yourSeat={yourSeat} clientId={clientId} code={code} />}
      
      {room.status !== "waiting" && game && yourSeat !== null && (
        <>
          {gameMode === "cicmic" ? (
            <CicmicBoard room={room} game={game} yourSeat={yourSeat} code={code} />
          ) : gameMode === "pishpirik" ? (
            <PishpirikBoard
              room={room}
              game={game}
              yourSeat={yourSeat}
              code={code}
              selectedCard={selectedCard}
              setSelectedCard={setSelectedCard}
              actionError={actionError}
              setActionError={setActionError}
            />
          ) : (
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
        </>
      )}
    </main>
  );
}

// ----------------------------------------------------------------------
// HEADER & WAITING ROOM
// ----------------------------------------------------------------------

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

  async function leave() {
    removeRecentRoom(code);
    await fetch(`/api/rooms/${code}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    router.push("/lobby");
  }

  async function kickPlayer(targetClientId: string) {
    if (!confirm("Are you sure you want to kick this player?")) return;
    await fetch(`/api/rooms/${code}/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, targetClientId }),
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
        <span className="glass rounded-full px-3 py-1 uppercase tracking-widest text-neon-purple-soft font-bold">{room.rules.gameMode || "Zhol"}</span>
        {room.rules.gameMode === "zhol" && <span className="glass rounded-full px-3 py-1">Out at {room.rules.eliminationScore} pts</span>}
        {room.rules.gameMode === "pishpirik" && <span className="glass rounded-full px-3 py-1">Ends when all 52 cards are used</span>}
        {room.rules.gameMode === "cicmic" && <span className="glass rounded-full px-3 py-1">Classic rules — no points</span>}
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

// ----------------------------------------------------------------------
// CICMIC BOARD (NINE MEN'S MORRIS)
// ----------------------------------------------------------------------

function CicmicBoard({ room, game, yourSeat, code }: { room: Omit<Room, "passwordHash">; game: ClientGameState; yourSeat: number; code: string; }) {
  const [optimisticBoard, setOptimisticBoard] = useState<Record<number, 1 | 2 | "X" | null>>(() => {
    const full: Record<number, 1 | 2 | "X" | null> = {};
    for (let i = 0; i < 24; i++) full[i] = game.board?.[i] ?? null;
    return full;
  });

  const [selectedFrom, setSelectedFrom] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const full: Record<number, 1 | 2 | "X" | null> = {};
    for (let i = 0; i < 24; i++) full[i] = game.board?.[i] ?? null;
    setOptimisticBoard(full);
    setSelectedFrom(null);
  }, [game.board, game.turnIdx, game.pendingRemoval]);

  const isYourTurn = game.turnIdx === yourSeat && !game.matchOver;
  const myPlayerId = yourSeat === 0 ? 1 : 2;
  const enemyPlayerId = myPlayerId === 1 ? 2 : 1;

  const myBoardCount = Object.values(optimisticBoard).filter((v) => v === myPlayerId).length;
  const enemyBoardCount = Object.values(optimisticBoard).filter((v) => v === enemyPlayerId).length;

  const TOTAL_PIECES = 9;

  // Placement is done once both players have placed all 9 pieces — tracked server-side so
  // permanently-destroyed points (from Mills) never get confused for "still placing" cells.
  const myUnplaced = game.unplacedPieces?.[myPlayerId as 1 | 2] ?? 0;
  const enemyUnplaced = game.unplacedPieces?.[enemyPlayerId as 1 | 2] ?? 0;
  const isPlacementPhase = myUnplaced > 0 || enemyUnplaced > 0;

  const isFlying = myBoardCount === 3 && !isPlacementPhase;
  const isPendingRemoval = game.pendingRemoval && isYourTurn;

  const enemySeatIdx = room.seats.findIndex((s, idx) => idx !== yourSeat && s !== null);
  const enemyNickname = enemySeatIdx !== -1 ? room.seats[enemySeatIdx]?.nickname : "Enemy";

  async function handlePointClick(ptIdx: number) {
    if (!isYourTurn) return;
    setError("");

    const owner = optimisticBoard[ptIdx];
    const isDestroyed = owner === "X";
    const isEmpty = owner === null || owner === undefined;

    // --- 1. REMOVAL MODE ---
    if (isPendingRemoval) {
      if (owner !== enemyPlayerId) {
        setError("Click a PINK enemy piece to remove it!");
        return;
      }

      setOptimisticBoard((prev) => ({ ...prev, [ptIdx]: null }));

      const res = await fetch(`/api/rooms/${code}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: getClientId(), action: "cicmic_remove", point: ptIdx }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        setError(errJson.error || "Removal rejected.");
        setOptimisticBoard(game.board || {});
      }
      return;
    }

    // --- 2. PLACEMENT MODE ---
    if (isPlacementPhase) {
      if (isDestroyed) {
        setError("That point was destroyed by a Mill — it can never be used again!");
        return;
      }
      if (!isEmpty) {
        setError("Point is already occupied!");
        return;
      }

      setOptimisticBoard((prev) => ({ ...prev, [ptIdx]: myPlayerId }));

      const res = await fetch(`/api/rooms/${code}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: getClientId(), action: "cicmic_place", point: ptIdx }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        setError(errJson.error || "Placement rejected.");
        setOptimisticBoard(game.board || {});
      }
      return;
    }

    // --- 3. MOVEMENT / FLYING MODE ---
    if (selectedFrom === null) {
      if (owner === myPlayerId) {
        setSelectedFrom(ptIdx);
      } else {
        setError("Click one of your BLUE pieces to select it.");
      }
    } else {
      if (owner === myPlayerId) {
        setSelectedFrom(ptIdx); // Switch selection
        return;
      }

      if (!isEmpty) {
        setError(isDestroyed ? "That point was destroyed by a Mill — it can never be used again!" : "Destination point is occupied!");
        return;
      }

      const from = selectedFrom;
      const to = ptIdx;

      setOptimisticBoard((prev) => ({ ...prev, [from]: null, [to]: myPlayerId }));
      setSelectedFrom(null);

      const res = await fetch(`/api/rooms/${code}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: getClientId(), action: "cicmic_move", from, to }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        setError(errJson.error || "Move rejected.");
        setOptimisticBoard(game.board || {});
      }
    }
  }

  const POINTS = [
    { x: 10, y: 10 }, { x: 50, y: 10 }, { x: 90, y: 10 },
    { x: 90, y: 50 }, { x: 90, y: 90 }, { x: 50, y: 90 },
    { x: 10, y: 90 }, { x: 10, y: 50 },
    { x: 25, y: 25 }, { x: 50, y: 25 }, { x: 75, y: 25 },
    { x: 75, y: 50 }, { x: 75, y: 75 }, { x: 50, y: 75 },
    { x: 25, y: 75 }, { x: 25, y: 50 },
    { x: 40, y: 40 }, { x: 50, y: 40 }, { x: 60, y: 40 },
    { x: 60, y: 50 }, { x: 60, y: 60 }, { x: 50, y: 60 },
    { x: 40, y: 60 }, { x: 40, y: 50 },
  ];

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="grid w-full max-w-lg grid-cols-2 gap-4">
        {/* ENEMY */}
        <div className={`glass flex flex-col rounded-2xl p-4 border-2 transition-all ${!isYourTurn ? "border-neon-pink/80 bg-neon-pink/10 shadow-[0_0_15px_rgba(255,91,200,0.2)]" : "border-white/10"}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full bg-neon-pink shadow-[0_0_8px_#ff5bc8]" />
              <span className="font-bold text-white text-sm">{enemyNickname}</span>
            </div>
            {!isYourTurn && <span className="text-[10px] uppercase font-extrabold tracking-wider bg-neon-pink/20 text-neon-pink px-2 py-0.5 rounded-full animate-pulse">Turn</span>}
          </div>
          <div className="flex gap-1 justify-between my-2 bg-black/30 p-2 rounded-xl border border-white/5">
            {Array.from({ length: TOTAL_PIECES }).map((_, idx) => {
              const isPlaced = idx < enemyBoardCount;
              const isUnplaced = idx < enemyBoardCount + enemyUnplaced && !isPlaced;
              return (
                <div
                  key={idx}
                  className={`h-3.5 w-3.5 rounded-full border transition-all ${
                    isPlaced ? "bg-neon-pink border-white shadow-[0_0_6px_#ff5bc8]" : isUnplaced ? "bg-neon-pink/40 border-neon-pink/60" : "bg-black/50 border-white/10 opacity-20"
                  }`}
                />
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-1 text-center text-[11px] mt-1 text-white/60">
            <div><span className="block text-[9px] uppercase tracking-wider text-white/40">On Board</span><span className="font-extrabold text-neon-pink text-sm">{enemyBoardCount}</span></div>
            <div><span className="block text-[9px] uppercase tracking-wider text-white/40">Reserve</span><span className="font-extrabold text-white text-sm">{enemyUnplaced}</span></div>
          </div>
        </div>

        {/* YOU */}
        <div className={`glass flex flex-col rounded-2xl p-4 border-2 transition-all ${isYourTurn ? "border-neon-blue/80 bg-neon-blue/10 shadow-[0_0_15px_rgba(77,216,255,0.2)]" : "border-white/10"}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full bg-neon-blue shadow-[0_0_8px_#4dd8ff]" />
              <span className="font-bold text-white text-sm">You</span>
            </div>
            {isYourTurn && <span className="text-[10px] uppercase font-extrabold tracking-wider bg-neon-blue/20 text-neon-blue-soft px-2 py-0.5 rounded-full animate-pulse">Your Turn</span>}
          </div>
          <div className="flex gap-1 justify-between my-2 bg-black/30 p-2 rounded-xl border border-white/5">
            {Array.from({ length: TOTAL_PIECES }).map((_, idx) => {
              const isPlaced = idx < myBoardCount;
              const isUnplaced = idx < myBoardCount + myUnplaced && !isPlaced;
              return (
                <div
                  key={idx}
                  className={`h-3.5 w-3.5 rounded-full border transition-all ${
                    isPlaced ? "bg-neon-blue border-white shadow-[0_0_6px_#4dd8ff]" : isUnplaced ? "bg-neon-blue/40 border-neon-blue/60" : "bg-black/50 border-white/10 opacity-20"
                  }`}
                />
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-1 text-center text-[11px] mt-1 text-white/60">
            <div><span className="block text-[9px] uppercase tracking-wider text-white/40">On Board</span><span className="font-extrabold text-neon-blue-soft text-sm">{myBoardCount}</span></div>
            <div><span className="block text-[9px] uppercase tracking-wider text-white/40">Reserve</span><span className="font-extrabold text-white text-sm">{myUnplaced}</span></div>
          </div>
        </div>
      </div>

      {/* BANNER */}
      <div className="text-center min-h-[40px] flex items-center justify-center">
        {isYourTurn ? (
          isPendingRemoval ? (
            <span className="animate-pulse-glow rounded-full bg-neon-pink/20 px-5 py-1.5 text-neon-pink font-extrabold text-sm border border-neon-pink/40 shadow-lg">
              💥 MILL FORMED! Click a PINK enemy piece to remove it!
            </span>
          ) : isPlacementPhase ? (
            <span className="animate-pulse-glow rounded-full bg-neon-blue/15 px-5 py-1.5 text-neon-blue-soft font-bold text-sm border border-neon-blue/30">
              Placement Phase — Click an empty point
            </span>
          ) : isFlying ? (
            <span className="animate-pulse-glow rounded-full bg-neon-purple/20 px-5 py-1.5 text-neon-purple-soft font-extrabold text-sm border border-neon-purple/40">
              🦅 FLYING PHASE! Click your piece, then ANY open point!
            </span>
          ) : selectedFrom !== null ? (
            <span className="animate-pulse-glow rounded-full bg-neon-blue/20 px-5 py-1.5 text-neon-blue-soft font-bold text-sm border border-neon-blue/40">
              Piece Selected — Click an adjacent empty point to move
            </span>
          ) : (
            <span className="animate-pulse-glow rounded-full bg-neon-blue/15 px-5 py-1.5 text-neon-blue-soft font-bold text-sm border border-neon-blue/30">
              Movement Phase — Click one of your blue pieces
            </span>
          )
        ) : (
          <span className="text-white/40 font-medium text-sm">Waiting for {enemyNickname}'s move...</span>
        )}
      </div>

      {error && <p className="text-neon-pink text-sm font-bold bg-neon-pink/10 px-4 py-1 rounded-lg border border-neon-pink/30">{error}</p>}

      {/* THE BOARD */}
      <div className="relative w-full max-w-lg aspect-square bg-[#0f0c22] rounded-2xl border border-white/15 p-4 shadow-2xl glow-purple overflow-hidden">
        <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-white/20" strokeWidth="4">
          <rect x="10%" y="10%" width="80%" height="80%" fill="none" />
          <rect x="25%" y="25%" width="50%" height="50%" fill="none" />
          <rect x="40%" y="40%" width="20%" height="20%" fill="none" />
          <line x1="50%" y1="10%" x2="50%" y2="40%" />
          <line x1="50%" y1="60%" x2="50%" y2="90%" />
          <line x1="10%" y1="50%" x2="40%" y2="50%" />
          <line x1="60%" y1="50%" x2="90%" y2="50%" />
        </svg>

        {POINTS.map((pt, i) => {
          const owner = optimisticBoard[i];
          const isMyPiece = owner === myPlayerId;
          const isEnemyPiece = owner === enemyPlayerId;
          const isDestroyedPoint = owner === "X";
          const isSelected = selectedFrom === i;

          return (
            <button
              key={i}
              type="button"
              className={`absolute flex items-center justify-center transition-all duration-150 transform -translate-x-1/2 -translate-y-1/2 rounded-full border-2 cursor-pointer
                ${isSelected ? "ring-4 ring-yellow-400 scale-125 z-30 shadow-[0_0_15px_#facc15]" : ""}
                ${
                  isMyPiece
                    ? "w-8 h-8 sm:w-10 sm:h-10 bg-neon-blue border-white z-20 shadow-[0_0_12px_#4dd8ff]"
                    : isEnemyPiece
                    ? "w-8 h-8 sm:w-10 sm:h-10 bg-neon-pink border-white z-20 shadow-[0_0_12px_#ff5bc8]"
                    : isDestroyedPoint
                    ? "w-6 h-6 sm:w-8 sm:h-8 bg-black border-red-900/60 cursor-not-allowed z-10 opacity-70"
                    : "w-6 h-6 sm:w-8 sm:h-8 bg-[#181335] border-white/30 hover:border-white hover:bg-white/20 z-10"
                }
              `}
              style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
              onClick={() => handlePointClick(i)}
            >
              {isDestroyedPoint && <span className="text-red-500/80 text-xs font-black leading-none">×</span>}
              {!owner && <span className="w-2 h-2 rounded-full bg-white/40" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
// ----------------------------------------------------------------------
// PISHPIRIK BOARD
// ----------------------------------------------------------------------

function PishpirikBoard({
  room, game, yourSeat, code, selectedCard, setSelectedCard, actionError, setActionError
}: {
  room: Omit<Room, "passwordHash">; game: ClientGameState; yourSeat: number; code: string;
  selectedCard: string | null; setSelectedCard: (c: string | null) => void;
  actionError: string; setActionError: (e: string) => void;
}) {
  const isYourTurn = game.turnIdx === yourSeat && !game.matchOver;
  const canAct = isYourTurn && game.turnPhase === "discard";
  const tablePile = game.tablePile || [];

  async function playCard(cardId: string) {
    setActionError("");
    const res = await fetch(`/api/rooms/${code}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: getClientId(), action: "pishpirik_play", cardId }),
    });
    if (!res.ok) setActionError((await res.json()).error);
    setSelectedCard(null);
  }

  return (
    <div className="relative space-y-4">
      <div className="felt-table relative rounded-3xl p-6">
        <div className="flex items-center justify-between text-xs text-white/50">
          <span>Pishpirik</span>
          <span className="text-white/30">{tablePile.length === 0 ? "Table empty" : `Pile: ${tablePile.length} card${tablePile.length === 1 ? "" : "s"}`}</span>
        </div>

        <div className="flex items-center justify-center py-16">
          {tablePile.length === 0 ? (
            <div className="h-24 w-16 rounded-lg border border-dashed border-white/15 bg-black/10 sm:h-28 sm:w-[4.5rem] flex items-center justify-center text-white/30 text-xs">Empty</div>
          ) : (
            <div className="relative h-24 w-16 sm:h-28 sm:w-[4.5rem]">
              {tablePile.map((id, i) => (
                <motion.div
                  key={id + i}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1, x: i * 3, y: -i * 3, rotate: i % 2 === 0 ? -2 : 2 }}
                  className="absolute inset-0"
                  style={{ zIndex: i }}
                >
                  <PlayingCard id={id} />
                </motion.div>
              ))}
              <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-wider text-white/30 whitespace-nowrap">
                {tablePile.length} card{tablePile.length === 1 ? "" : "s"} in pile
              </span>
            </div>
          )}
        </div>
        <div className="text-center text-sm font-semibold mt-6">
          {isYourTurn ? (
            <span className="animate-pulse-glow rounded-full bg-neon-blue/10 px-4 py-1 text-neon-blue-soft">Your turn — Play a card</span>
          ) : (
            <span className="text-white/40">Waiting...</span>
          )}
        </div>
        {actionError && <p className="mt-2 text-center text-sm text-neon-pink">{actionError}</p>}
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="mb-3 flex justify-between items-center">
          <span className="text-sm font-semibold text-white/70">Your Hand</span>
          <button disabled={!canAct || !selectedCard} onClick={() => selectedCard && playCard(selectedCard)} className="rounded-lg bg-neon-purple/20 px-4 py-1.5 text-xs font-bold text-neon-purple-soft disabled:opacity-30">
            Play Selected Card
          </button>
        </div>
        <HandFan cards={game.yourHand} selectedCard={selectedCard} onSelect={(id) => canAct && setSelectedCard(selectedCard === id ? null : id)} interactive={canAct} />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// ZHOL (GIN) GAME BOARD
// ----------------------------------------------------------------------

function GameBoard({
  room, game, yourSeat, code, selectedCard, setSelectedCard, actionError, setActionError
}: {
  room: Omit<Room, "passwordHash">; game: ClientGameState; yourSeat: number; code: string;
  selectedCard: string | null; setSelectedCard: (c: string | null) => void;
  actionError: string; setActionError: (e: string) => void;
}) {
  const router = useRouter();
  const clientId = getClientId();
  const you = room.seats[yourSeat];
  const isHost = room.hostClientId === clientId;

  const [optimisticGame, setOptimisticGame] = useState<ClientGameState | null>(null);
  const [isDraggingStock, setIsDraggingStock] = useState(false);
  const [dropX, setDropX] = useState<number | null>(null);
  
  useEffect(() => {
    setOptimisticGame(game);
  }, [game]);

  const displayGame = optimisticGame || game;
  const topStockCard = displayGame.deck.length > 0 ? displayGame.deck[displayGame.deck.length - 1] : null;

  const discardRef = useRef<HTMLDivElement>(null);
  const ginRef = useRef<HTMLButtonElement>(null);

  const isYourTurn = displayGame.turnIdx === yourSeat && !displayGame.matchOver;
  const canAct = isYourTurn && displayGame.turnPhase === "discard";
  const playableHand = displayGame.yourHand.filter((id) => id !== "__DRAWING__");

  const deadwoodInfo = useMemo(() => minimizeDeadwood(playableHand), [playableHand]);
  const jokersInHand = useMemo(() => playableHand.filter(isJokerId), [playableHand]);
  const resolvedMelds = useMemo(() => resolveJokerPlaceholders(deadwoodInfo.melds, jokersInHand), [deadwoodInfo, jokersInHand]);
  
  const meldIndexByCard = useMemo(() => {
    const map: Record<string, number> = {};
    resolvedMelds.forEach((m, idx) => m.cards.forEach((c) => (map[c] = idx)));
    return map;
  }, [resolvedMelds]);

  async function sendMove(body: Record<string, unknown>) {
    setActionError("");
    const next = { ...displayGame };
    const action = body.action as string;
    const cardId = body.cardId as string;
    const source = body.source as string;

    if (action === "discard" || action === "gin") {
      next.yourHand = next.yourHand.filter((c) => c !== cardId);
      next.discard = [...next.discard, cardId];
      next.discardTop = cardId;
      next.turnPhase = action === "gin" ? "round_over" : "draw";
      if (action === "discard") next.turnIdx = -1;
    } else if (action === "draw" && source === "discard") {
      if (next.discardTop) {
        next.yourHand = [...next.yourHand, next.discardTop];
        next.discard = next.discard.slice(0, -1);
        next.discardTop = next.discard.length > 0 ? next.discard[next.discard.length - 1] : null;
      }
      next.turnPhase = "discard";
    } else if (action === "draw" && source === "stock") {
      const drawnCard = next.deck.pop();
      next.yourHand = [...next.yourHand, drawnCard || ""];
      next.turnPhase = "discard";
    }

    setOptimisticGame(next);
    setSelectedCard(null);

    const res = await fetch(`/api/rooms/${code}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, ...body }),
    });
    if (!res.ok) {
      setActionError((await res.json()).error || "Move failed.");
      setOptimisticGame(game);
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

  async function kickPlayer(targetClientId: string) {
    if (!confirm("Are you sure you want to kick this player?")) return;
    await fetch(`/api/rooms/${code}/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, targetClientId }),
    });
  }

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
      if (achievesGin) sendMove({ action: "gin", cardId });
      else setActionError("That card does not result in a valid Gin.");
    } else if (checkZone(discardRef) || info.offset.y < -150) {
      if (achievesGin) sendMove({ action: "gin", cardId });
      else sendMove({ action: "discard", cardId });
    }
  };

  const autoGinDiscard = useMemo(() => (canAct && playableHand.length === 11 ? findGinDiscard(playableHand) : null), [canAct, playableHand]);
  const selectedAchievesGin = canAct && !!selectedCard && canGin(playableHand.filter((c) => c !== selectedCard));
  const ginDiscardCard = selectedAchievesGin ? selectedCard : autoGinDiscard;
  const canDeclareGin = canAct && !!ginDiscardCard;
  const turnPlayerName = displayGame.turnIdx === yourSeat ? "you" : room.seats[displayGame.turnIdx]?.nickname ?? "opponent";

  const prevRoundRef = useRef<number | null>(null);
  const [dealState, setDealState] = useState<{ round: number; targets: DealTarget[] } | null>(null);
  const [showingScore, setShowingScore] = useState(false);

  useEffect(() => {
    if (prevRoundRef.current === null || displayGame.roundNumber !== prevRoundRef.current) {
      const isFirstLoad = prevRoundRef.current === null;
      prevRoundRef.current = displayGame.roundNumber;
      const activeSeatIndices = room.seats.map((s, i) => (s && !s.eliminated ? i : -1)).filter((i) => i !== -1);
      const starterSeat = activeSeatIndices.length > 0 ? activeSeatIndices[displayGame.roundNumber % activeSeatIndices.length] : yourSeat;

      const targets: DealTarget[] = [
        { seatIdx: yourSeat, nickname: you?.nickname ?? "You", isYou: true, finalCount: yourSeat === starterSeat ? 11 : 10 },
        ...displayGame.opponents.filter((o) => !o.eliminated).map((o) => ({ seatIdx: o.seatIdx, nickname: o.nickname, isYou: false, finalCount: o.seatIdx === starterSeat ? 11 : 10 })),
      ];

      if (!isFirstLoad && displayGame.lastRoundEnd) {
        setShowingScore(true);
        const timer = setTimeout(() => { setShowingScore(false); if (!displayGame.matchOver) setDealState({ round: displayGame.roundNumber, targets }); }, 5000);
        return () => clearTimeout(timer);
      } else {
        setShowingScore(false);
        if (!displayGame.matchOver) setDealState({ round: displayGame.roundNumber, targets });
      }
    }
  }, [displayGame.roundNumber]);

  return (
    <div className="relative space-y-4">
      <AnimatePresence>
        {dealState && dealState.round === displayGame.roundNumber && <DealAnimation targets={dealState.targets} onComplete={() => setDealState(null)} />}
      </AnimatePresence>

      <div className="relative h-48 sm:h-56">
        {displayGame.opponents.map((opp, i) => {
          const pos = seatPosition(i, displayGame.opponents.length);
          const oppClientId = room.seats[opp.seatIdx]?.clientId;
          return (
            <div key={opp.seatIdx} className="absolute -translate-x-1/2 -translate-y-1/2 space-y-1" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
              <PlayerStrip nickname={opp.nickname} connected={opp.connected} cardCount={opp.cardCount} score={opp.score} eliminated={opp.eliminated} isTurn={displayGame.turnIdx === opp.seatIdx} faceDown />
              {isHost && oppClientId && (
                <button onClick={() => kickPlayer(oppClientId)} className="mx-auto block w-3/4 rounded bg-neon-pink/20 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neon-pink transition hover:bg-neon-pink/30">
                  Kick
                </button>
              )}
              {!opp.eliminated && <div className="flex justify-center"><OpponentFan count={showingScore ? 0 : opp.cardCount} /></div>}
            </div>
          );
        })}
      </div>

      <div className="felt-table relative rounded-3xl p-6">
        <div className="flex items-center justify-between text-xs text-white/50">
          <span>Round {displayGame.roundNumber} • Out at {room.rules.eliminationScore}</span>
        </div>

        <div className={`flex items-center justify-center gap-6 sm:gap-12 py-10 transition-opacity duration-500 ${showingScore ? "opacity-0" : "opacity-100"}`} ref={discardRef}>
          <div className="relative">
            {displayGame.deck.length > 1 && <div className="absolute -left-1.5 -top-1.5 opacity-50"><PlayingCard id={null} faceDown /></div>}
            {displayGame.deck.length > 2 && <div className="absolute -left-0.5 -top-0.5 opacity-80"><PlayingCard id={null} faceDown /></div>}
            <motion.button
              drag={isYourTurn && displayGame.turnPhase === "draw" ? true : false}
              dragSnapToOrigin
              whileDrag={{ scale: 1.05, zIndex: 50 }}
              onDragStart={() => setIsDraggingStock(true)}
              onDragEnd={(e, info) => {
                setIsDraggingStock(false);
                if (info.offset.y > 60) {
                  setDropX(info.point.x);
                  sendMove({ action: "draw", source: "stock" });
                }
              }}
              disabled={!isYourTurn || displayGame.turnPhase !== "draw"}
              onClick={() => { setDropX(null); sendMove({ action: "draw", source: "stock" }); }}
              className="relative z-10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <PlayingCard id={isDraggingStock ? topStockCard : null} faceDown={!isDraggingStock} layoutId={isYourTurn && displayGame.turnPhase === "draw" && topStockCard ? `card-${topStockCard}` : undefined} />
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-2 py-0.5 text-[10px] font-bold text-white shadow">{displayGame.deck.length}</span>
            </motion.button>
          </div>

          <div className="relative">
            <motion.button
              drag={isYourTurn && displayGame.turnPhase === "draw" && displayGame.discardTop ? true : false}
              dragSnapToOrigin
              whileDrag={{ scale: 1.05, zIndex: 50 }}
              onDragEnd={(e, info) => {
                if (info.offset.y > 60) {
                  setDropX(info.point.x);
                  sendMove({ action: "draw", source: "discard" });
                }
              }}
              disabled={!isYourTurn || displayGame.turnPhase !== "draw" || !displayGame.discardTop}
              onClick={() => { setDropX(null); sendMove({ action: "draw", source: "discard" }); }}
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

        <div className={`mt-2 text-center text-sm font-semibold transition-opacity duration-500 ${showingScore ? "opacity-0" : "opacity-100"}`}>
          {displayGame.matchOver ? <span className="text-neon-purple-soft">Match complete</span> : isYourTurn ? <span className="animate-pulse-glow rounded-full bg-neon-blue/10 px-4 py-1 text-neon-blue-soft">Your turn — {displayGame.turnPhase === "draw" ? "draw a card" : "discard or declare Gin"}</span> : <span className="text-white/40">Waiting for {turnPlayerName}...</span>}
        </div>

        {actionError && <p className="mt-2 text-center text-sm text-neon-pink">{actionError}</p>}
        <AnimatePresence>{showingScore && displayGame.lastRoundEnd && <RoundEndReveal info={displayGame.lastRoundEnd} room={room} roundKey={displayGame.roundNumber} />}</AnimatePresence>
        <AnimatePresence>{displayGame.matchOver && !showingScore && <WinOverlay game={displayGame} room={room} onExit={leave} />}</AnimatePresence>
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-white/70">Deadwood: <span className={deadwoodInfo.deadwood === 0 ? "text-neon-blue-soft" : "text-white"}>{deadwoodInfo.deadwood}</span></span>
          <div className="flex flex-wrap gap-2">
            <ActionButton ref={ginRef} disabled={!canDeclareGin} onClick={() => sendMove({ action: "gin", cardId: ginDiscardCard || "" })} variant="purple">Zhol! (Gin)</ActionButton>
            <ActionButton disabled={!canAct || !selectedCard} onClick={() => sendMove({ action: "discard", cardId: selectedCard || "" })} variant="ghost">Discard</ActionButton>
          </div>
        </div>
        <HandFan cards={showingScore ? [] : displayGame.yourHand} selectedCard={selectedCard} onSelect={(id) => canAct && setSelectedCard(selectedCard === id ? null : id)} interactive={canAct && !showingScore} meldIndexByCard={meldIndexByCard} onDragEnd={handleDragEnd} insertAtX={dropX} />
      </div>

      <PlayerStrip nickname={you?.nickname ?? "You"} connected={!!you?.connected} cardCount={displayGame.yourHand.length} score={you?.score ?? 0} eliminated={you?.eliminated ?? false} isTurn={displayGame.turnIdx === yourSeat} />
    </div>
  );
}

// ----------------------------------------------------------------------
// SHARED UTILITIES
// ----------------------------------------------------------------------

function seatPosition(index: number, opponentCount: number): { x: number; y: number } {
  const totalSeats = opponentCount + 1;
  const angleStep = 360 / totalSeats;
  const angleDeg = 90 + angleStep * (index + 1);
  const rad = (angleDeg * Math.PI) / 180;
  return { x: 50 + 42 * Math.cos(rad), y: 50 + 40 * Math.sin(rad) };
}

const ActionButton = forwardRef<HTMLButtonElement, { children: React.ReactNode; disabled?: boolean; onClick: () => void; variant: "blue" | "purple" | "pink" | "ghost"; }>(({ children, disabled, onClick, variant }, ref) => {
  const styles = { blue: "bg-neon-blue/20 text-neon-blue-soft hover:bg-neon-blue/30", purple: "bg-neon-purple/20 text-neon-purple-soft hover:bg-neon-purple/30", pink: "bg-neon-pink/20 text-neon-pink hover:bg-neon-pink/30", ghost: "bg-white/10 text-white/80 hover:bg-white/20" }[variant];
  return <button ref={ref} disabled={disabled} onClick={onClick} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-25 ${styles}`}>{children}</button>;
});
ActionButton.displayName = "ActionButton";

function PlayerStrip({ nickname, connected, cardCount, score, eliminated, isTurn, faceDown }: { nickname: string; connected: boolean; cardCount: number; score: number; eliminated: boolean; isTurn: boolean; faceDown?: boolean; }) {
  return (
    <div className={`glass flex items-center justify-between rounded-xl px-4 py-2.5 ${isTurn && !eliminated ? "ring-1 ring-neon-blue/50" : ""} ${eliminated ? "opacity-40 grayscale" : ""}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-neon-pink animate-pulse"}`} />
        <span className="font-bold text-white">{nickname}</span>
        {eliminated && <span className="text-xs text-neon-pink">out</span>}
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-3xl bg-black/70 backdrop-blur-md">
      <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", bounce: 0.5 }} className="text-center">
        <div className="mb-1 text-xs uppercase tracking-[0.3em] text-neon-blue-soft">Match Over</div>
        <div className="text-4xl font-black text-glow-purple">{winner} Wins! 🏆</div>
      </motion.div>
      <button onClick={onExit} className="glow-blue rounded-xl bg-gradient-to-r from-neon-blue to-neon-purple px-6 py-2.5 font-bold text-black">Back to Lobby</button>
    </motion.div>
  );
}
