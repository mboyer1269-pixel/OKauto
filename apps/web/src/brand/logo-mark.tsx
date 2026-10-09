import spec from "./spec.json";
import { cn } from "@/lib/utils";

type BarCount = "5" | "7" | "17";

function barLayout(count: BarCount) {
  const bars = spec.bars[count];
  const { viewBox, pad, barUnit, gapRatio, radius } = spec.mark;
  const n = bars.length;
  const totalUnits = n * barUnit + (n - 1) * gapRatio;
  const inner = viewBox - 2 * pad;
  const scale = inner / totalUnits;
  const barW = barUnit * scale;
  const gap = gapRatio * scale;
  const rx = radius * scale;
  let x = pad;
  return bars.map((bar) => {
    const rect = { x, y: bar.y, w: barW, h: bar.h, rx };
    x += barW + gap;
    return rect;
  });
}

export function LogoMark({
  className,
  size = "full",
  title = spec.ariaLabel,
}: {
  className?: string;
  size?: "full" | "medium" | "small";
  title?: string;
}) {
  if (spec.mark.kind !== "vin-bars") {
    throw new Error(
      `LogoMark: kind « ${spec.mark.kind} » non implémenté. Voir src/brand/README.md.`,
    );
  }
  const count: BarCount =
    size === "small" ? "5" : size === "medium" ? "7" : "17";
  const view = spec.mark.viewBox;
  const radius = view * spec.mark.iconRadiusRatio;

  return (
    <svg
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={cn("h-9 w-9 shrink-0", className)}
      viewBox={`0 0 ${view} ${view}`}
      fill="none"
    >
      {title ? <title>{title}</title> : null}
      <rect
        width={view}
        height={view}
        rx={radius}
        fill="hsl(var(--brand-graphite))"
      />
      {barLayout(count).map((bar, index) => (
        <rect
          key={index}
          x={bar.x}
          y={bar.y}
          width={bar.w}
          height={bar.h}
          rx={bar.rx}
          fill="hsl(var(--brand-amber))"
        />
      ))}
    </svg>
  );
}
