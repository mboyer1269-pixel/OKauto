/**
 * Resilient form-field adapters for the Marketplace vehicle listing form.
 *
 * Strategy: locate editable controls by accessible name (aria-label, wrapping
 * <label> text, or placeholder) using a versioned chain of candidate labels.
 * When nothing matches (selector drift after a Facebook UI change) the caller
 * degrades to copy-mode — the user pastes values manually and nothing breaks.
 *
 * Compliance guardrails, by design:
 *  - fills happen only on an explicit user click,
 *  - only text inputs/textareas are written to (native dropdowns are never
 *    force-opened or clicked),
 *  - no button on the host page is ever clicked programmatically — the human
 *    always reviews and publishes.
 */

export type FieldKey =
  | "year"
  | "make"
  | "model"
  | "trim"
  | "mileage"
  | "price"
  | "description"
  | "location"
  | "exteriorColor"
  | "interiorColor";

/** Ordered candidate accessible-names per field (extend when Facebook renames). */
const LABEL_CHAINS: Record<FieldKey, string[]> = {
  year: ["year"],
  make: ["make"],
  model: ["model"],
  trim: ["trim"],
  mileage: ["mileage", "odometer"],
  price: ["price", "asking price"],
  description: ["description"],
  location: ["location"],
  exteriorColor: ["exterior color", "exterior colour"],
  interiorColor: ["interior color", "interior colour"],
};

type Editable = HTMLInputElement | HTMLTextAreaElement;

function accessibleName(el: Element): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim().toLowerCase();
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
    if (text) return text.toLowerCase();
  }
  const label = el.closest("label");
  if (label?.textContent) return label.textContent.trim().toLowerCase();
  const placeholder = el.getAttribute("placeholder");
  if (placeholder) return placeholder.trim().toLowerCase();
  return "";
}

function isFillable(el: Element): el is Editable {
  if (el instanceof HTMLTextAreaElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  const type = el.type.toLowerCase();
  return ["text", "number", "search", "tel", ""].includes(type) && !el.readOnly && !el.disabled;
}

export function findField(key: FieldKey, root: ParentNode = document): Editable | null {
  const candidates = [...root.querySelectorAll("input, textarea")].filter(isFillable);
  for (const label of LABEL_CHAINS[key]) {
    // Exact accessible-name match first, then prefix match.
    const exact = candidates.find((el) => accessibleName(el) === label);
    if (exact) return exact;
    const prefix = candidates.find((el) => accessibleName(el).startsWith(label));
    if (prefix) return prefix;
  }
  return null;
}

/** Set a value the way a user typing would, so React state stays in sync. */
export function setNativeValue(el: Editable, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export interface FillResult {
  key: FieldKey;
  status: "filled" | "not_found";
}

/** Fill a single field; returns whether the selector chain resolved. */
export function fillField(key: FieldKey, value: string): FillResult {
  const el = findField(key);
  if (!el) return { key, status: "not_found" };
  el.focus();
  setNativeValue(el, value);
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  return { key, status: "filled" };
}

export function flashElement(el: Element): void {
  el.classList.add("lotpilot-flash");
  setTimeout(() => el.classList.remove("lotpilot-flash"), 1200);
}

/** True on the Marketplace vehicle-create form. */
export function onVehicleCreatePage(): boolean {
  return /\/marketplace\/create\/vehicle/.test(location.pathname);
}

/** True on a published Marketplace item page (used to suggest the posted URL). */
export function marketplaceItemUrl(): string | null {
  return /\/marketplace\/item\/\d+/.test(location.pathname) ? location.href : null;
}
