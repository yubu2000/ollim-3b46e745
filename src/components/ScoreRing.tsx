export function ScoreRing({ value, suffix = "" }: { value: number; suffix?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const tone =
    clamped >= 80 ? "var(--chart-2)" : clamped >= 50 ? "var(--chart-3)" : "var(--destructive)";

  return (
    <div className="flex items-center gap-4">
      <div
        className="grid h-20 w-20 place-items-center rounded-full"
        style={{
          background: `conic-gradient(${tone} ${clamped * 3.6}deg, var(--secondary) 0deg)`,
        }}
      >
        <div className="grid h-15 w-15 place-items-center rounded-full bg-card p-3">
          <span className="text-lg font-bold tabular-nums">{clamped}</span>
        </div>
      </div>
      <div className="text-sm text-muted-foreground">
        {clamped >= 80 ? "우수" : clamped >= 50 ? "보통" : "개선 필요"}
        {suffix && <span className="ml-1">({clamped}{suffix})</span>}
      </div>
    </div>
  );
}
