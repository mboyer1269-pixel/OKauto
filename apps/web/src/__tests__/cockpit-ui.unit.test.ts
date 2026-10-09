import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (...parts: string[]) =>
  readFileSync(join(__dirname, "..", ...parts), "utf8");

describe("Cockpit — logo D et thème", () => {
  it("affiche le mot-symbole D dans la barre latérale et l’en-tête mobile", () => {
    const layout = src("components", "dashboard-layout.tsx");
    expect(layout).toMatch(/<BrandMark lockup inverted size="app" \/>/g);
    expect(layout.match(/<BrandMark lockup inverted size="app" \/>/g)?.length).toBe(
      2,
    );
    expect(layout).toContain("cockpit-grid");
    expect(layout).toContain('w-56');
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
    expect(listings).toContain("CockpitSkeleton");
    expect(listings).toContain("cockpit-scan");
    expect(listings).not.toMatch(/text-slate-950|bg-slate-200|bg-slate-50/);
  });
});
