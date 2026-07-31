"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { getClientId } from "@/lib/client-id";

export default function CreateRoomModal({ nickname, onClose }: { nickname: string; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(`${nickname}'s table`);
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
          visibility,
          password: visibility === "private" && password ? password : undefined,
          maxPlayers,
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
                  visibility === v ? "border-neon-blue/60 bg-neon-blue/15 text-neon-blue-soft" : "border-white/10 text-white/50"
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
              Players ({maxPlayers}) {maxPlayers >= 3 && <span className="text-neon-purple-soft">· 2 decks + 2 jokers</span>}
            </label>
            <div className="flex gap-2">
              {[2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  onClick={() => setMaxPlayers(n)}
                  className={`flex-1 rounded-lg border px-2 py-2 text-sm font-semibold transition ${
                    maxPlayers === n ? "border-neon-purple/60 bg-neon-purple/15 text-neon-purple-soft" : "border-white/10 text-white/50"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 flex justify-between text-xs font-medium uppercase tracking-wider text-white/50">
              <span>Elimination score</span>
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
            <p className="mt-1 text-[11px] text-white/40">Reach this score and you&apos;re out. Last player standing wins.</p>
          </div>

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

          <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/50">
            No knocking — Gin only. Deadwood: number cards at face value, A/J/Q/K all count 10. On a win, the winner
            <span className="text-white/70"> subtracts</span> the bonus from their own score (Gin -10 · Joker Gin -20 ·
            Suit Gin -25 · Suit + Joker Gin -50), while everyone else <span className="text-white/70">adds their own
            deadwood</span> to theirs.
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-neon-pink">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-white/10 py-2.5 font-semibold text-white/70">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={busy || !name.trim()}
            className="glow-blue flex-1 rounded-xl bg-gradient-to-r from-neon-blue to-neon-purple py-2.5 font-bold text-black disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
