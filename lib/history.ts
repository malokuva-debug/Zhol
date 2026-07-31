import type { Room } from "./types";

/**
 * Persists a finished match to Postgres for history purposes. Entirely
 * optional — no-ops without DATABASE_URL, so gameplay never depends on it.
 */
export async function recordMatchHistory(room: Room, startedAt: number) {
  if (!process.env.DATABASE_URL) return;
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const players = room.seats.filter(Boolean).map((s) => ({
      nickname: s!.nickname,
      score: s!.score,
      eliminated: s!.eliminated,
    }));
    if (players.length === 0 || !room.game) return;
    const winnerNickname =
      room.game.matchWinnerIdx !== undefined ? room.seats[room.game.matchWinnerIdx]?.nickname ?? "?" : "?";

    await prisma.matchHistory.create({
      data: {
        roomCode: room.code,
        roomName: room.name,
        playersJson: JSON.stringify(players),
        winner: winnerNickname,
        roundsPlayed: room.game.roundNumber,
        playerCount: players.length,
        startedAt: new Date(startedAt),
      },
    });
    await prisma.$disconnect();
  } catch (err) {
    console.error("recordMatchHistory failed (non-fatal):", err);
  }
}
