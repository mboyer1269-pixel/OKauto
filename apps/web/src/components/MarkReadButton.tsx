"use client";

import { useRouter } from "next/navigation";

export function MarkReadButton() {
  const router = useRouter();
  return (
    <button
      className="btn btn-secondary"
      type="button"
      onClick={async () => {
        await fetch("/api/v1/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markAll: true }),
        });
        router.refresh();
      }}
    >
      Mark all read
    </button>
  );
}
