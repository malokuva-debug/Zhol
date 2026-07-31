"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { getClientId } from "@/lib/client-id";

export default function CreateRoomModal({ nickname, onClose }: { nickname: string; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(`${nickname}'s table`);
  const [gameMode, setGameMode] = useState<"zhol" | "pishpirik" | "cicmic">("zhol");
  const [teamMode, setTeamMode] = useState<"1v1" | "2v2">("1v1");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [password, setPassword] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [turnTimer, setTurnTimer] = useState(30);
  const [eliminationScore, setEliminationScore] = useState(101);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
          teamMode, // Sent safely here
          visibility,
          password: visibility === "private" && password ? password : undefined,
          maxPlayers: teamMode === "2v2" ? 4 : maxPlayers, // Force 4 players if 2v2 is selected
          turnTimerSeconds: turnTimer,
          eliminationScore,
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
          
          {/* GAME MODE SELECTION */}
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

          {/* TEAM MODE SELECTION */}
          {gameMode !== "cicmic" && (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/50">Format</label>
              <div className="flex gap-2">
                {(["1v1", "2v2", "free"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setTeamMode(mode as "1v1" | "2v2");
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
              Players ({teamMode === "2v2" ? 4 : maxPlayers})
            </label>
            <div className="flex gap-2">
              {[2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  disabled={teamMode === "2v2"}
                  onClick={() => setMaxPlayers(n)}
                  className={`flex-1 rounded-lg border px-2 py-2 text-sm font-semibold transition ${
                    (teamMode === "2v2" ? 4 : maxPlayers) === n ? "border-neon-purple/60 bg-neon-purple/15 text-neon-purple-soft" : "border-white/10 text-white/50 hover:bg-white/5"
                  } ${teamMode === "2v2" && n !== 4 ? "opacity-30 cursor-not-allowed" : ""}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {gameMode !== "cicmic" && (
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

          <div>
            <label className="mb-1 flex justify-between text-xs font-medium uppercase tracking-wider text-white/50">
              <span>Turn timer</span>
              <span>{turnTimer === 0 ? "Off" : `${turnTimer}s`}</span>
            </label>
            <input
              type="range"
              min={0}
              max={90}
              step={15}
              value={turnTimer}
              onChange={(e) => setTurnTimer(Number(e.target.value))}
              className="w-full accent-[#4dd8ff]"
            />
          </div>

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
