"use client";

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-ink-700/60 bg-ink-800/70 p-5 ${className}`}>{children}</div>;
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-500 focus-visible:outline-brand-400 disabled:bg-ink-700",
  secondary: "bg-ink-700 text-ink-200 hover:bg-ink-600 focus-visible:outline-brand-400 disabled:bg-ink-800",
  danger: "bg-red-900/80 text-red-200 hover:bg-red-800 focus-visible:outline-red-400 disabled:bg-ink-700",
  ghost: "bg-transparent text-ink-400 hover:text-ink-200 hover:bg-ink-700/50 focus-visible:outline-brand-400",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className = "", ...props },
  ref,
) {
  const sizing = size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm";
  return (
    <button
      ref={ref}
      className={`rounded-lg font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:text-ink-400 ${sizing} ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = "", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-200 placeholder:text-ink-600 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${className}`}
      {...props}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className = "", ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={`rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-ink-200 focus:border-brand-500 focus:outline-none ${className}`}
      {...props}
    />
  );
});

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-400">{hint}</span> : null}
    </label>
  );
}

export function Badge({ children, colorClass }: { children: ReactNode; colorClass: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}>{children}</span>;
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-ink-400" role="status" aria-label={label}>
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-600 border-t-brand-400" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-ink-700 py-12 text-center">
      <p className="text-sm font-semibold text-ink-200">{title}</p>
      {hint ? <p className="max-w-md text-xs text-ink-400">{hint}</p> : null}
      {action}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl border border-ink-700 bg-ink-800 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-200">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-ink-200">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
