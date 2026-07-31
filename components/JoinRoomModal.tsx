"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { getClientId } from "@/lib/client-id";
import type { RoomSummary } from "@/lib/types";

export default function JoinRoomModal({
  room,
  nickname,
  onClose,
}: {
  room: RoomSummary;
  nickname: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [team, setTeam] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleJoin() {
    setBusy(true);
    setError("");

    try {
      const res = await fetch(`/api/rooms/${room.code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname,
          clientId: getClientId(),
          password: password || undefined,
          team,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to join room.");

      router.push(`/room/${room.code}`);
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
        className="glass glow-blue w-full max-w-sm rounded-2xl p-6"
      >
        <h2 className="mb-1 text-xl font-bold text-glow-purple">Join {room.name}</h2>
        <p className="mb-4 text-xs text-white/50">Hosted by {room.hostNickname}</p>

        <div className="space-y-4">
          {room.hasPassword && (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/50">Room Password</label>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-neon-blue/50"
              />
            </div>
          )}

          {/* SHOW TEAM SELECTION IF IT IS 2v2 */}
          {room.rules?.teamMode === "2v2" && (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/50">Choose Team</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setTeam(1)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    team === 1 ? "border-neon-blue bg-neon-blue/20 text-neon-blue-soft" : "border-white/10 text-white/50"
                  }`}
                >
                  Team 1
                </button>
                <button
                  onClick={() => setTeam(2)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    team === 2 ? "border-neon-pink bg-neon-pink/20 text-neon-pink" : "border-white/10 text-white/50"
                  }`}
                >
                  Team 2
                </button>
              </div>
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-neon-pink">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-white/10 py-2.5 font-semibold text-white/70 hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={handleJoin}
            disabled={busy || (room.hasPassword && !password)}
            className="glow-blue flex-1 rounded-xl bg-gradient-to-r from-neon-blue to-neon-purple py-2.5 font-bold text-black disabled:opacity-50"
          >
            {busy ? "Joining..." : "Join"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
