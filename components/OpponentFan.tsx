export default function OpponentFan({ count }: { count: number }) {
  const n = Math.max(0, count);
  const center = (n - 1) / 2;
  const angleStep = n > 1 ? Math.min(6, 50 / n) : 0;

  return (
    // Rotating the whole fan 180° gives the "looking at their cards from
    // across the table" upside-down read, using the same card-back art.
    <div className="flex items-start justify-center rotate-180 px-2 py-1">
      {Array.from({ length: n }).map((_, i) => {
        const offset = i - center;
        const rotate = offset * angleStep;
        const arcY = Math.abs(offset) * (angleStep * 0.9);
        return (
          <div
            key={i}
            style={{
              transform: `rotate(${rotate}deg) translateY(${arcY}px)`,
              marginLeft: i === 0 ? 0 : -22,
              transformOrigin: "top center",
            }}
          >
            <div className="h-14 w-9 rounded border border-neon-purple/40 bg-gradient-to-br from-[#2a1a55] to-[#150c33] shadow-md" />
          </div>
        );
      })}
    </div>
  );
}
