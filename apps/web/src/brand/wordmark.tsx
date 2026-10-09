import { useId } from "react";
import specJson from "./spec.json";
import type { BrandSpec } from "./types";
import { layoutWordmark } from "./geometry";
import { HatchShape } from "./hatch";
import { cn } from "@/lib/utils";

const spec = specJson as BrandSpec;

export function Wordmark({
  className,
  inverted = false,
  title = spec.lockup ?? `${spec.wordmark} ${spec.descriptor}`,
}: {
  className?: string;
  inverted?: boolean;
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  if (!spec.wordmarkView) {
    return null;
  }
  const { width, height, parts } = layoutWordmark(spec);
  const from = inverted
    ? (spec.colors.gradientFromOnDark ?? spec.colors.accent)
    : (spec.colors.gradientFrom ?? spec.colors.ink);
  const to = inverted
    ? (spec.colors.gradientToOnDark ?? spec.colors.accent)
    : (spec.colors.gradientTo ?? spec.colors.accent);

  return (
    <svg
      role="img"
      aria-label={title}
      className={cn("h-9 w-auto", className)}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
    >
      <title>{title}</title>
      <HatchShape
        parts={parts}
        clipId={`${uid}-clip`}
        gradientId={`${uid}-grad`}
        hatchId={`${uid}-hatch`}
        pitch={spec.wordmarkView.hatchPitch}
        bar={spec.wordmarkView.hatchBar}
        from={from}
        to={to}
        width={width}
        height={height}
      />
    </svg>
  );
}
