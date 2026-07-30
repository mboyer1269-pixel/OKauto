/** Typed accessor for the org settings JSON blob. */
export interface OrgSettings {
  disclaimers: string[];
  soldDetectionThreshold: number;
  defaultTone: "professional" | "friendly" | "energetic";
  defaultLocation: string | null;
}

export function orgSettings(raw: unknown): OrgSettings {
  const obj = (raw ?? {}) as Partial<OrgSettings>;
  return {
    disclaimers: Array.isArray(obj.disclaimers)
      ? obj.disclaimers.filter((d) => typeof d === "string")
      : [],
    soldDetectionThreshold:
      typeof obj.soldDetectionThreshold === "number" && obj.soldDetectionThreshold >= 1
        ? Math.min(obj.soldDetectionThreshold, 10)
        : 2,
    defaultTone:
      obj.defaultTone === "friendly" || obj.defaultTone === "energetic"
        ? obj.defaultTone
        : "professional",
    defaultLocation: typeof obj.defaultLocation === "string" ? obj.defaultLocation : null,
  };
}
