import { cn } from "@/lib/utils";

interface BrandMarkProps {
  compact?: boolean;
  inverted?: boolean;
  className?: string;
}

export function BrandMark({
  compact = false,
  inverted = false,
  className,
}: BrandMarkProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-2.5", className)}
      aria-label="Suivia Auto"
    >
      <svg
        aria-hidden="true"
        className="h-9 w-9 shrink-0"
        viewBox="0 0 40 40"
        fill="none"
      >
        <rect
          width="40"
          height="40"
          rx="12"
          fill={inverted ? "#39BDF8" : "#0967D2"}
        />
        <path
          d="M11 14.5h14.2c3.2 0 5.8 2.4 5.8 5.5s-2.6 5.5-5.8 5.5H15.4"
          stroke="white"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <circle cx="11" cy="25.5" r="2.4" fill="white" />
        <circle
          cx="29"
          cy="14.5"
          r="2.4"
          fill={inverted ? "#07182D" : "#7DD3FC"}
        />
      </svg>
      {!compact && (
        <span className="leading-none">
          <span
            className={cn(
              "brand-display block text-[1.15rem] font-black tracking-[-0.035em]",
              inverted ? "text-white" : "text-slate-950",
            )}
          >
            Suivia
          </span>
          <span
            className={cn(
              "brand-label mt-1 block text-[0.58rem] font-bold uppercase tracking-[0.24em]",
              inverted ? "text-sky-200" : "text-brand-600",
            )}
          >
            Auto
          </span>
        </span>
      )}
    </span>
  );
}
