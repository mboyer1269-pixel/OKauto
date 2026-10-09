import specJson from "@/brand/spec.json";
import type { BrandSpec } from "@/brand/types";
import { LogoMark } from "@/brand/logo-mark";
import { cn } from "@/lib/utils";

const spec = specJson as BrandSpec;

interface BrandMarkProps {
  compact?: boolean;
  inverted?: boolean;
  className?: string;
  showDescriptor?: boolean;
}

export function BrandMark({
  compact = false,
  inverted = false,
  className,
  showDescriptor = true,
}: BrandMarkProps) {
  const label = showDescriptor
    ? `${spec.ariaLabel}, ${spec.descriptor}`
    : spec.ariaLabel;
  const wordmarkFont =
    spec.typography.wordmarkFont === "mono" ? "font-mono" : "font-sans";

  return (
    <span
      className={cn("inline-flex items-center gap-2.5", className)}
      aria-label={label}
    >
      <LogoMark />
      {!compact && (
        <span className="leading-none">
          <span
            className={cn(
              "block text-[1.05rem]",
              wordmarkFont,
              inverted ? "text-sidebar-foreground" : "text-foreground",
            )}
            style={{
              letterSpacing: spec.typography.wordmarkTracking,
              fontWeight: Number(spec.typography.wordmarkWeight),
            }}
          >
            {spec.wordmark}
          </span>
          {showDescriptor ? (
            <span
              className={cn(
                "mt-1 block font-sans text-[0.58rem] font-semibold uppercase tracking-[0.22em]",
                inverted ? "text-sidebar-accent" : "text-muted-foreground",
              )}
            >
              {spec.descriptor}
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}
