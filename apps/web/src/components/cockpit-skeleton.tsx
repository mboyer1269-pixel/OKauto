import { cn } from "@/lib/utils";

export function CockpitSkeleton({
  className,
  rows = 3,
}: {
  className?: string;
  rows?: number;
}) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="cockpit-skeleton h-16 rounded-xl"
        />
      ))}
    </div>
  );
}
