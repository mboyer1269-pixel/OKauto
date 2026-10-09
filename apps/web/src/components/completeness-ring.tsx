import { cn } from "@/lib/utils";

export function CompletenessRing({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  const r = 10;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = c - (clamped / 100) * c;
  const tone =
    clamped >= 75 ? "text-signal" : clamped >= 50 ? "text-warning" : "text-destructive";

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 font-mono text-xs tabular-nums", className)}
      title={`Complétude de la fiche : ${clamped} %`}
    >
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <circle
          cx="14"
          cy="14"
          r={r}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="3"
        />
        <circle
          cx="14"
          cy="14"
          r={r}
          fill="none"
          className={tone}
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 14 14)"
        />
      </svg>
      <span className="text-muted-foreground">{clamped} %</span>
    </span>
  );
}
