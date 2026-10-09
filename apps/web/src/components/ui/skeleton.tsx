import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("cockpit-skeleton rounded-xl", className)}
      {...props}
    />
  );
}

export { Skeleton };
