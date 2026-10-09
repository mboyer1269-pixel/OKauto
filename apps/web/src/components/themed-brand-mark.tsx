"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { BrandMark } from "@/components/brand-mark";

export function ThemedBrandLockup({
  className,
  size = "header",
}: {
  className?: string;
  size?: "header" | "app" | "login";
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const inverted = mounted && resolvedTheme === "dark";
  return (
    <BrandMark lockup inverted={inverted} size={size} className={className} />
  );
}
