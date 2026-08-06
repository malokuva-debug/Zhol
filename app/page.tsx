"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { getNickname, setNickname, getClientId } from "@/lib/client-id";

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getClientId(); // ensure a device id exists
    const existing = getNickname();
    if (existing) setName(existing);
  }, []);

  function handlePlay() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Nickname must be at least 2 characters.");
      return;
    }
    if (trimmed.length > 20) {
      setError("Nickname must be 20 characters or fewer.");
      return;
    }
    setNickname(trimmed);
    router.push("/lobby");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-neon-purple/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-neon-blue/15 blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="glass glow-purple relative z-10 w-full max-w-md rounded-3xl p-8"
      >
        <div className="mb-2 text-center text-sm font-semibold uppercase tracking-[0.3em] text-neon-blue-soft">
          SHUFFLE
        </div>
        <h1 className="mb-1 text-center text-5xl font-black tracking-tight text-glow-purple">
          KOSOVA
        </h1>
        <p className="mb-8 text-center text-sm text-white/60">
          Real-time 1v1 Gin Rummy. No sign-up, no passwords — just play.
        </p>

        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/50">
          Your nickname
        </label>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && handlePlay()}
          maxLength={20}
          placeholder="e.g. Blerim"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-lg text-white outline-none ring-neon-blue/50 transition focus:ring-2"
          autoFocus
        />
        {error && <p className="mt-2 text-sm text-neon-pink">{error}</p>}

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handlePlay}
          className="glow-blue mt-6 w-full rounded-xl bg-gradient-to-r from-neon-blue to-neon-purple px-6 py-3.5 text-lg font-bold text-black transition"
        >
          Play
        </motion.button>

        <p className="mt-4 text-center text-xs text-white/30">
          Your nickname is saved on this device only. No account required.
        </p>
      </motion.div>
    </main>
  );
}
