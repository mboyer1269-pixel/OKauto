export type MarkKind =
  | "vin-bars"
  | "stroke-s"
  | "map-pin"
  | "hatched-s";

export type Circle = { cx: number; cy: number; r: number };

export type BrandSpec = {
  id: "A" | "B" | "C" | "D";
  name: string;
  wordmark: string;
  descriptor: string;
  lockup?: string;
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
    navy?: string;
    cyan?: string;
    gradientFrom?: string;
    gradientTo?: string;
    gradientFromOnDark?: string;
    gradientToOnDark?: string;
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
    hatchPitch?: number;
    hatchBar?: number;
  };
  bars?: Record<string, Array<{ y: number; h: number }>>;
  wordmarkView?: {
    width: number;
    height: number;
    letterHeight: number;
    y: number;
    pad: number;
    gap: number;
    space: number;
    hatchPitch: number;
    hatchBar: number;
    sequence: string[];
    arrow: boolean;
  };
};
