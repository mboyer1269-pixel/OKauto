export type MarkKind = "vin-bars" | "stroke-s" | "map-pin";

export type Circle = { cx: number; cy: number; r: number };

export type BrandSpec = {
  id: "A" | "B" | "C";
  name: string;
  wordmark: string;
  descriptor: string;
  ariaLabel: string;
  typography: {
    wordmarkFont: "mono" | "sans";
    wordmarkTracking: string;
    wordmarkWeight: string;
  };
  colors: {
    ink: string;
    paper: string;
    accent: string;
    markBg: string;
    markFg: string;
  };
  mark: {
    kind: MarkKind;
    viewBox: number;
    iconRadiusRatio: number;
    pad?: number;
    barUnit?: number;
    gapRatio?: number;
    radius?: number;
    fullBarCount?: number;
    mediumBarCount?: number;
    smallBarCount?: number;
    strokeWidth?: number;
    path?: string;
    node?: Circle;
    pinHead?: Circle;
    pinTip?: number[][];
    hole?: Circle;
    badge?: Circle;
  };
  bars?: Record<string, Array<{ y: number; h: number }>>;
};
