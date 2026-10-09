"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const options = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
  { value: "system", label: "Système", icon: Monitor },
] as const;

export function ThemeToggle({
  variant = "icons",
}: {
  variant?: "icons" | "list";
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={cn(
          variant === "icons" ? "h-8 w-[6.5rem]" : "h-24",
          "rounded-lg bg-white/10",
        )}
        aria-hidden
      />
    );
  }

  if (variant === "list") {
    return (
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Apparence</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {options.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                theme === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card hover:bg-muted",
              )}
              aria-pressed={theme === value}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <div
      className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5"
      role="group"
      aria-label="Thème"
    >
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          className={cn(
            "rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground",
            theme === value && "bg-white/10 text-sidebar-accent",
          )}
          aria-label={label}
          aria-pressed={theme === value}
          title={label}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
