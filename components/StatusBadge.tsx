import type { RoomStatus } from "@/lib/types";

const STYLES: Record<RoomStatus, string> = {
  waiting: "bg-neon-blue/15 text-neon-blue-soft border-neon-blue/30",
  playing: "bg-neon-purple/15 text-neon-purple-soft border-neon-purple/30",
  finished: "bg-white/10 text-white/50 border-white/15",
};

const LABELS: Record<RoomStatus, string> = {
  waiting: "Waiting",
  playing: "Playing",
  finished: "Finished",
};

export default function StatusBadge({ status }: { status: RoomStatus }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-bold ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
