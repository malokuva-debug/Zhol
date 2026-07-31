"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { getNickname, getClientId } from "@/lib/client-id";
import { useLiveData } from "@/lib/use-live-data";
import { lobbyChannel, EVENTS } from "@/lib/pusher";
import type { RoomSummary } from "@/lib/types";
import CreateRoomModal from "@/components/CreateRoomModal";
import JoinRoomModal from "@/components/JoinRoomModal";
import StatusBadge from "@/components/StatusBadge";

interface LobbyResponse {
  rooms: RoomSummary[];
  playersOnline: number;
  gamesInProgress: number;
}

export default function LobbyPage() {
  const router = useRouter();
  const [nickname, setNicknameState] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [joinTarget, setJoinTarget] = useState<RoomSummary | null>(null);
  const [joinCode, setJoinCode] = useState("");

  const { data, loading, refetch } = useLiveData<LobbyResponse>("/api/lobby", lobbyChannel(), EVENTS.LOBBY_UPDATED, 3000);

  useEffect(() => {
    const n = getNickname();
    if (!n) {
      router.replace("/");
      return;
    }
    setNicknameState(n);
    getClientId();
  }, [router]);

  const rooms = data?.rooms ?? [];

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-neon-blue-soft">Lobby</div>
          <h1 className="text-3xl font-black text-glow-purple">ZHOL Tables</h1>
        </div>
        <div className="glass flex items-center gap-5 rounded-2xl px-5 py-3 text-sm">
          <span className="text-white/60">
            Playing as <span className="font-bold text-neon-blue-soft">{nickname}</span>
          </span>
          <div className="h-4 w-px bg-white/15" />
          <span className="text-white/60">
            <span className="font-bold text-white">{data?.playersOnline ?? 0}</span> online
          </span>
          <span className="text-white/60">
            <span className="font-bold text-white">{data?.gamesInProgress ?? 0}</span> playing
          </span>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap gap-3">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowCreate(true)}
          className="glow-blue rounded-xl bg-gradient-to-r from-neon-blue to-neon-purple px-5 py-2.5 font-bold text-black"
        >
          + Create Room
        </motion.button>
        <button
          onClick={() => setJoinTarget({} as RoomSummary)}
          className="glass rounded-xl px-5 py-2.5 font-semibold text-white/90 transition hover:bg-white/10"
        >
          Join by Code
        </button>
        <button
          onClick={() => refetch()}
          className="glass ml-auto rounded-xl px-5 py-2.5 font-semibold text-white/70 transition hover:bg-white/10"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="glass overflow-hidden rounded-2xl">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 border-b border-white/10 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white/40">
          <span>Room</span>
          <span>Players</span>
          <span>Rules</span>
          <span>Status</span>
          <span></span>
        </div>

        {loading && rooms.length === 0 && (
          <div className="px-5 py-10 text-center text-white/40">Loading tables…</div>
        )}
        {!loading && rooms.length === 0 && (
          <div className="px-5 py-10 text-center text-white/40">
            No active rooms. Be the first to create one!
          </div>
        )}

        <AnimatePresence>
          {rooms.map((room) => (
            <motion.div
              key={room.code}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 border-b border-white/5 px-5 py-4 text-sm transition hover:bg-white/5"
            >
              <div>
                <div className="font-semibold text-white">
                  {room.name} {room.visibility === "private" && <span className="ml-1 text-xs text-neon-purple-soft">🔒</span>}
                </div>
                <div className="text-xs text-white/40">
                  Host: {room.hostNickname} · Code {room.code}
                </div>
              </div>
              <div className="font-mono text-white/70">{room.playerCount}/{room.maxPlayers}</div>
              <div className="text-xs text-white/50">
                Out at {room.rules.eliminationScore} · {room.rules.turnTimerSeconds ? `${room.rules.turnTimerSeconds}s timer` : "No timer"}
              </div>
              <StatusBadge status={room.status} />
              <button
                disabled={room.status !== "waiting" || room.playerCount >= room.maxPlayers}
                onClick={() => setJoinTarget(room)}
                className="rounded-lg bg-white/10 px-4 py-2 text-xs font-bold text-white transition enabled:hover:bg-neon-blue/30 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {room.playerCount >= room.maxPlayers ? "Full" : "Join"}
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {showCreate && <CreateRoomModal nickname={nickname} onClose={() => setShowCreate(false)} />}
      {joinTarget && (
        <JoinRoomModal
          room={"code" in joinTarget ? (joinTarget as RoomSummary) : null}
          nickname={nickname}
          initialCode={joinCode}
          onClose={() => {
            setJoinTarget(null);
            setJoinCode("");
          }}
        />
      )}
    </main>
  );
}
