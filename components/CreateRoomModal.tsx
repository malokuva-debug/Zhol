"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { getClientId } from "@/lib/client-id";

export default function CreateRoomModal({ nickname, onClose }: { nickname: string; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(`${nickname}'s table`);
  const [gameMode, setGameMode] = useState<"zhol" | "pishpirik" | "cicmic">("zhol");
  const [zholMode, setZholMode] = useState<"classic" | "free_play">("classic");
  const [teamMode, setTeamMode] = useState<"1v1" | "2v2" | "free">("free");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [password, setPassword] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [eliminationScore, setEliminationScore] = useState(101);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Enforce mode rules dynamically
  useEffect(() => {
    if (gameMode === "zhol") {
      setTeamMode("free");
    } else if (gameMode === "cicmic") {
      setTeamMode("1v1");
      setMaxPlayers(2);
    } else if (gameMode === "pishpirik") {
      if (teamMode === "1v1") setMaxPlayers(2);
      else if (teamMode === "2v2") setMaxPlayers(4);
      else if (maxPlayers > 4) setMaxPlayers(4); // Pishpirik free is max 4
    }
  }, [gameMode, teamMode, maxPlayers]);

  async function handleCreate() {
    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          gameMode,
          zholMode: gameMode === "zhol" ? zholMode : undefined,
          teamMode,
          visibility,
          password: visibility === "private" && password ? password : undefined,
          maxPlayers,
          eliminationScore: zholMode === "free_play" ? 0 : eliminationScore,
          hostNickname: nickname,
          hostClientId: getClientId(),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create room.");
      
      router.push(`/room/${json.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="glass glow-purple max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-6"
      >
        <h2 className="mb-4 text-xl font-bold text-glow-purple">Create Room</h2>

        <div className="space-y-4">
          
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/50">Game Mode</label>
            <div className="flex gap-2">
              {(["zhol", "pishpirik", "cicmic"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setGameMode(mode)}
                  className={`flex-1 rounded-lg border px-2 py-2 text-sm font-semibold capitalize transition ${
                    gameMode === mode ? "border-neon-purple/60 bg-neon-purple/15 text-neon-purple-soft" : "border-white/10 text-white/50 hover:bg-white/5"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {gameMode === "zhol" && (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/50">Zhol Mode</label>
              <div className="flex gap-2">
                {[
                  { id: "classic", label: "Classic" },
                  { id: "free_play", label: "Free Play" },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setZholMode(mode.id as "classic" | "free_play")}
                    className={`flex-1 rounded-lg border px-2 py-2 text-sm font-semibold transition ${
                      zholMode === mode.id
                        ? "border-neon-purple/60 bg-neon-purple/15 text-neon-purple-soft"
                        : "border-white/10 text-white/50 hover:bg-white/5"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {gameMode === "pishpirik" && (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/50">Format</label>
              <div className="flex gap-2">
                {(["1v1", "2v2", "free"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setTeamMode(mode);
                      if (mode === "1v1") setMaxPlayers(2);
                      if (mode === "2v2") setMaxPlayers(4);
                    }}
                    className={`flex-1 rounded-lg border px-2 py-2 text-sm font-semibold uppercase transition ${
                      teamMode === mode ? "border-neon-purple/60 bg-neon-purple/15 text-neon-purple-soft" : "border-white/10 text-white/50 hover:bg-white/5"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/50">Room name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-neon-blue/50"
            />
          </div>

          <div className="flex gap-2">
            {(["public", "private"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVisibility(v)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold capitalize transition ${
                  visibility === v ? "border-neon-blue/60 bg-neon-blue/15 text-neon-blue-soft" : "border-white/10 text-white/50 hover:bg-white/5"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {visibility === "private" && (
            <input
              type="password"
              placeholder="Optional password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-neon-blue/50"
            />
          )}

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/50">
              Players ({maxPlayers})
            </label>
            <div className="flex gap-2">
              {[2, 3, 4, 5, 6].map((n) => {
                const disabled = gameMode === "cicmic" || teamMode !== "free" || (gameMode === "pishpirik" && n > 4);
                return (
                  <button
                    key={n}
                    disabled={disabled}
                    onClick={() => setMaxPlayers(n)}
                    className={`flex-1 rounded-lg border px-2 py-2 text-sm font-semibold transition ${
                      maxPlayers === n ? "border-neon-purple/60 bg-neon-purple/15 text-neon-purple-soft" : "border-white/10 text-white/50 hover:bg-white/5"
                    } ${disabled && maxPlayers !== n ? "opacity-20 cursor-not-allowed" : ""}`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          {gameMode === "zhol" && zholMode === "classic" && (
            <div>
              <label className="mb-1 flex justify-between text-xs font-medium uppercase tracking-wider text-white/50">
                <span>Score Limit</span>
                <span>{eliminationScore} pts</span>
              </label>
              <input
                type="range"
                min={21}
                max={200}
                step={10}
                value={eliminationScore}
                onChange={(e) => setEliminationScore(Number(e.target.value))}
                className="w-full accent-[#a35bff]"
              />
            </div>
          )}

          {gameMode === "zhol" && zholMode === "free_play" && (
            <p className="text-xs text-white/40 leading-relaxed">
              Free Play mode — play continuously without eliminations or score limits.
            </p>
          )}

          {gameMode === "pishpirik" && (
            <p className="text-xs text-white/40 leading-relaxed">
              No score limit — the round ends once all 52 cards are used. Points are tallied from captured cards (same-rank, Jack, or Pishpirik captures) and the highest total wins.
            </p>
          )}

          {gameMode === "cicmic" && (
            <p className="text-xs text-white/40 leading-relaxed">
              Classic Nine Men&apos;s Morris rules — no timer, no points. Win by reducing your opponent to 2 pieces or blocking all their moves.
            </p>
          )}

        </div>

        {error && <p className="mt-3 text-sm text-neon-pink">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-white/10 py-2.5 font-semibold text-white/70 hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={busy || !name.trim()}
            className="glow-blue flex-1 rounded-xl bg-gradient-to-r from-neon-blue to-neon-purple py-2.5 font-bold text-black disabled:opacity-50"
          >
            {busy ? "Creating..." : "Create"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
