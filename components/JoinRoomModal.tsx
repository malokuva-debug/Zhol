"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { getClientId } from "@/lib/client-id";
import type { RoomSummary } from "@/lib/types";

export default function JoinRoomModal({
  room,
  nickname,
  initialCode,
  onClose,
}: {
  room: RoomSummary | null;
  nickname: string;
  initialCode?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState(room?.code ?? initialCode ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleJoin() {
    const target = code.trim().toUpperCase();
    if (target.length < 4) {
      setError("Enter a valid room code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/rooms/${target}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, clientId: getClientId(), password: password || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to join room.");
      router.push(`/room/${target}`);
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
        <h2 className="mb-4 text-xl font-bold text-glow-blue">{room ? `Join "${room.name}"` : "Join by Code"}</h2>

        {!room && (
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/50">Room code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="X7P92Q"
              maxLength={6}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-center font-mono text-xl tracking-[0.3em] text-white outline-none focus:ring-2 focus:ring-neon-blue/50"
            />
          </div>
        )}

        {(room?.hasPassword ?? true) && (
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-white/50">
              Password {room && !room.hasPassword ? "(not required)" : ""}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank if none"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-neon-blue/50"
            />
          </div>
        )}

        {error && <p className="mt-3 text-sm text-neon-pink">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-white/10 py-2.5 font-semibold text-white/70">
            Cancel
          </button>
          <button
            onClick={handleJoin}
            disabled={busy}
            className="glow-blue flex-1 rounded-xl bg-gradient-to-r from-neon-blue to-neon-purple py-2.5 font-bold text-black disabled:opacity-50"
          >
            {busy ? "Joining…" : "Join"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
