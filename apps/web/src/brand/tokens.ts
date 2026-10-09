/**
 * Jetons de marque et de surface (Cockpit).
 * Les valeurs CSS vivent dans globals.css ; ce module sert les tests de contraste
 * et le script d’assets.
 */
export const brandColors = {
  graphite: "#111318",
  amber: "#FFB020",
  ivory: "#F5F3EE",
} as const;

export const cockpitLight = {
  bg: "#F7F8FA",
  surface: "#FFFFFF",
  text: "#0A0F1C",
  muted: "#5B6474",
  primary: "#2556E0",
  primaryForeground: "#FFFFFF",
  signal: "#0B7A56",
  warning: "#B45309",
  danger: "#DC2626",
} as const;

export const cockpitDark = {
  bg: "#0A0C10",
  surface: "#11141A",
  text: "#E8ECF2",
  muted: "#8A93A3",
  primary: "#2556E0",
  primaryForeground: "#FFFFFF",
  electric: "#3D7BFF",
  signal: "#2EE6A6",
  warning: "#FFB020",
  danger: "#FF5A5F",
} as const;

export const contrastPairs: Array<{
  name: string;
  fg: string;
  bg: string;
  min: number;
}> = [
  { name: "texte clair sur fond", fg: cockpitLight.text, bg: cockpitLight.bg, min: 4.5 },
  { name: "muet clair sur fond", fg: cockpitLight.muted, bg: cockpitLight.bg, min: 4.5 },
  { name: "muet clair sur surface", fg: cockpitLight.muted, bg: cockpitLight.surface, min: 4.5 },
  { name: "bouton primaire (clair et sombre)", fg: cockpitLight.primaryForeground, bg: cockpitLight.primary, min: 4.5 },
  { name: "lien primaire clair", fg: cockpitLight.primary, bg: cockpitLight.bg, min: 4.5 },
  { name: "signal clair", fg: cockpitLight.signal, bg: cockpitLight.bg, min: 4.5 },
  { name: "avertissement clair", fg: cockpitLight.warning, bg: cockpitLight.bg, min: 4.5 },
  { name: "danger clair", fg: cockpitLight.danger, bg: cockpitLight.bg, min: 4.5 },
  { name: "texte sombre sur fond", fg: cockpitDark.text, bg: cockpitDark.bg, min: 4.5 },
  { name: "muet sombre sur fond", fg: cockpitDark.muted, bg: cockpitDark.bg, min: 4.5 },
  { name: "muet sombre sur surface", fg: cockpitDark.muted, bg: cockpitDark.surface, min: 4.5 },
  { name: "lien électrique sombre", fg: cockpitDark.electric, bg: cockpitDark.bg, min: 4.5 },
  { name: "signal sombre", fg: cockpitDark.signal, bg: cockpitDark.bg, min: 4.5 },
  { name: "avertissement sombre", fg: cockpitDark.warning, bg: cockpitDark.bg, min: 4.5 },
  { name: "danger sombre", fg: cockpitDark.danger, bg: cockpitDark.bg, min: 4.5 },
  { name: "ambre sur graphite (logo)", fg: brandColors.amber, bg: brandColors.graphite, min: 4.5 },
];

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const n = Number.parseInt(value, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance(hex: string): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
