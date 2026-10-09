import type { HatchPart } from "./geometry";

function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  return `M ${x + radius} ${y} H ${x + w - radius} A ${radius} ${radius} 0 0 1 ${x + w} ${y + radius} V ${y + h - radius} A ${radius} ${radius} 0 0 1 ${x + w - radius} ${y + h} H ${x + radius} A ${radius} ${radius} 0 0 1 ${x} ${y + h - radius} V ${y + radius} A ${radius} ${radius} 0 0 1 ${x + radius} ${y} Z`;
}

export function partToPath(part: HatchPart): string {
  if (part.type === "rect") {
    return roundedRectPath(part.x, part.y, part.w, part.h, 2.2);
  }
  if (part.type === "poly") {
    return `M ${part.points.map((p) => p.join(" ")).join(" L ")} Z`;
  }
  return `${roundedRectPath(part.x, part.y, part.w, part.h, part.rx)} ${roundedRectPath(part.ix, part.iy, part.iw, part.ih, part.irx)}`;
}

export function HatchShape({
  parts,
  clipId,
  gradientId,
  hatchId,
  pitch,
  bar,
  from,
  to,
  width,
  height,
}: {
  parts: HatchPart[];
  clipId: string;
  gradientId: string;
  hatchId: string;
  pitch: number;
  bar: number;
  from: string;
  to: string;
  width: number;
  height: number;
}) {
  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
        <pattern
          id={hatchId}
          width={pitch}
          height={height}
          patternUnits="userSpaceOnUse"
        >
          <rect width={bar} height={height} fill="#fff" />
        </pattern>
        <mask id={`${hatchId}-mask`}>
          <rect width={width} height={height} fill={`url(#${hatchId})`} />
        </mask>
        <clipPath id={clipId} clipRule="evenodd">
          {parts.map((part, index) => (
            <path key={index} d={partToPath(part)} />
          ))}
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect
          width={width}
          height={height}
          fill={`url(#${gradientId})`}
          mask={`url(#${hatchId}-mask)`}
        />
      </g>
    </>
  );
}
