import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (...parts: string[]) =>
  readFileSync(join(__dirname, "..", ...parts), "utf8");
const webRoot = (...parts: string[]) =>
  readFileSync(join(__dirname, "..", "..", ...parts), "utf8");

describe("Cockpit — logo D et thème", () => {
  it("affiche le mot-symbole D dans la barre latérale et l’en-tête mobile", () => {
    const layout = src("components", "dashboard-layout.tsx");
    expect(layout.match(/<BrandMark lockup inverted size="app"/g)?.length).toBe(
      2,
    );
    expect(layout).toContain("cockpit-grid");
    expect(layout).toContain("w-64");
    expect(layout).toContain("shadow-[0_0_18px_hsl(var(--sidebar-accent)/0.28)]");
  });

  it("affiche le mot-symbole D sur la page de connexion", () => {
    const login = src("app", "login", "login-form.tsx");
    expect(login).toContain('size="login"');
    expect(login).toContain("ThemedBrandLockup");
    expect(login).toContain("cockpit-grid");
    expect(login).toContain("ThemeToggle");
  });

  it("utilise le pictogramme D comme favicon", () => {
    const icon = src("app", "icon.svg");
    expect(icon).toContain("#0B3A8A");
    expect(icon).toContain("#1AD0EA");
    expect(icon).toContain("#082A66");
    expect(icon).toContain('aria-label="Suivia Auto"');
  });

  it("démarre en thème sombre par défaut", () => {
    const provider = src("components", "theme-provider.tsx");
    expect(provider).toContain('defaultTheme="dark"');
    expect(provider).toContain("enableSystem");
  });

  it("utilise le cyan pour le texte primaire en sombre (AA)", () => {
    const css = src("app", "globals.css");
    const dark = css.split(".dark {")[1]?.split("html.dark")[0] ?? "";
    expect(dark).toMatch(/--primary:\s*188 83% 51%/);
    expect(dark).toMatch(/--primary-foreground:\s*223 24% 5%/);
    expect(css).toContain(
      '.dark a:not([class*="btn"]):not([class*="text-"]):not(.card)',
    );
    expect(webRoot("next.config.ts")).toContain("devIndicators: false");

    const dashboard = src("app", "dashboard", "page.tsx");
    expect(dashboard).toContain("Parcourir les véhicules");
    expect(dashboard).toContain("Ouvrir le carnet");
    expect(dashboard).toContain("Voir la synchronisation");
    expect(dashboard).toContain("Exporter le catalogue Meta");
    expect(dashboard).toContain("text-primary hover:underline");
    expect(src("app", "dashboard", "team", "page.tsx")).not.toMatch(
      /text-blue-|bg-blue-|border-blue-/,
    );
  });

  it("respecte prefers-reduced-motion et le verre dépoli", () => {
    const css = src("app", "globals.css");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".cockpit-grid");
    expect(css).toContain(".cockpit-scan");
    expect(css).toContain(".cockpit-skeleton");
    expect(css).toContain(".cockpit-panel");
    expect(css).toContain("backdrop-filter: blur(16px)");
    expect(css).toContain("hsl(var(--brand-navy)");
    expect(css).toContain("hsl(var(--brand-cyan)");
  });

  it("applique le langage Cockpit aux écrans demandés", () => {
    const dashboard = src("app", "dashboard", "page.tsx");
    const inventory = src("app", "dashboard", "inventory", "page.tsx");
    const vehicle = src("app", "dashboard", "inventory", "[id]", "page.tsx");
    const listings = src("app", "dashboard", "listings", "page.tsx");

    expect(dashboard).toContain("CockpitSkeleton");
    expect(dashboard).toContain("font-mono text-2xl font-bold tabular-nums");
    expect(inventory).toContain("CockpitSkeleton");
    expect(inventory).toContain("cockpit-scan");
    expect(vehicle).toContain("CockpitSkeleton");
    expect(vehicle).toContain("font-mono text-3xl font-bold tabular-nums");
    expect(vehicle).toContain("Build d’usine");
    expect(vehicle).toContain("vinDecodedFields");
    expect(vehicle).toContain("Complété depuis le NIV");
    expect(listings).toContain("CockpitSkeleton");
    expect(listings).toContain("cockpit-scan");
    expect(listings).not.toMatch(/text-slate-950|bg-slate-200|bg-slate-50/);
  });
});
