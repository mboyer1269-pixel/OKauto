import type { ReactNode } from "react";
import specJson from "./spec.json";
import type { BrandSpec } from "./types";
import { cn } from "@/lib/utils";

const spec = specJson as BrandSpec;

type BarCount = "5" | "7" | "17";
type MarkSize = "full" | "medium" | "small";

function barLayout(count: BarCount) {
  const bars = spec.bars?.[count];
  const { viewBox, pad = 7, barUnit = 1, gapRatio = 0.6, radius = 0.4 } =
    spec.mark;
  if (!bars) {
    throw new Error("LogoMark: géométrie des barres absente de spec.json.");
  }
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

function VinBars({ size }: { size: MarkSize }) {
  const count: BarCount =
    size === "small" ? "5" : size === "medium" ? "7" : "17";
  return (
    <>
      {barLayout(count).map((bar, index) => (
        <rect
          key={index}
          x={bar.x}
          y={bar.y}
          width={bar.w}
          height={bar.h}
          rx={bar.rx}
          fill="hsl(var(--brand-mark-fg))"
        />
      ))}
    </>
  );
}

function StrokeS({ size }: { size: MarkSize }) {
  const { path, strokeWidth, node } = spec.mark;
  if (!path || strokeWidth == null) {
    throw new Error("LogoMark: chemin stroke-s incomplet dans spec.json.");
  }
  return (
    <>
      <path
        d={path}
        stroke="hsl(var(--brand-mark-fg))"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {size !== "small" && node ? (
        <circle
          cx={node.cx}
          cy={node.cy}
          r={node.r}
          fill="hsl(var(--brand-amber))"
        />
      ) : null}
    </>
  );
}

function MapPin() {
  const { pinHead, pinTip, hole, badge } = spec.mark;
  if (!pinHead || !pinTip || !hole || !badge) {
    throw new Error("LogoMark: géométrie map-pin incomplète dans spec.json.");
  }
  const points = pinTip.map((pair) => pair.join(",")).join(" ");
  return (
    <>
      <circle
        cx={pinHead.cx}
        cy={pinHead.cy}
        r={pinHead.r}
        fill="hsl(var(--brand-mark-fg))"
      />
      <polygon points={points} fill="hsl(var(--brand-mark-fg))" />
      <circle
        cx={hole.cx}
        cy={hole.cy}
        r={hole.r}
        fill="hsl(var(--brand-mark-bg))"
      />
      <circle
        cx={badge.cx}
        cy={badge.cy}
        r={badge.r}
        fill="hsl(var(--brand-amber))"
      />
    </>
  );
}

export function LogoMark({
  className,
  size = "full",
  title = spec.ariaLabel,
}: {
  className?: string;
  size?: MarkSize;
  title?: string;
}) {
  const kind = spec.mark.kind;
  const view = spec.mark.viewBox;
  const radius = view * spec.mark.iconRadiusRatio;

  let inner: ReactNode;
  if (kind === "vin-bars") inner = <VinBars size={size} />;
  else if (kind === "stroke-s") inner = <StrokeS size={size} />;
  else if (kind === "map-pin") inner = <MapPin />;
  else {
    throw new Error(
      `LogoMark: kind « ${kind} » non implémenté. Voir src/brand/README.md.`,
    );
  }

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
        fill="hsl(var(--brand-mark-bg))"
      />
      {inner}
    </svg>
  );
}
