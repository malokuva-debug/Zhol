import { NextResponse } from "next/server";
import { listRoomSummaries } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const rooms = await listRoomSummaries();
  const playersOnline = rooms.reduce((sum, r) => sum + r.playerCount, 0);
  const gamesInProgress = rooms.filter((r) => r.status === "playing").length;
  return NextResponse.json({ rooms, playersOnline, gamesInProgress });
}
