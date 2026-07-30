export type AssistPayload = {
  title: string;
  price: number;
  description: string;
  year?: number;
  make?: string;
  model?: string;
  mileage?: number | null;
  bodyStyle?: string | null;
  exteriorColor?: string | null;
  photos?: string[];
};

export type FillResult = {
  filled: string[];
  missing: string[];
  captchaDetected: boolean;
  checkpointDetected: boolean;
};

const LABEL_ALIASES: Record<string, string[]> = {
  title: ["title", "listing title"],
  price: ["price"],
  description: ["description", "more details", "describe"],
  year: ["year"],
  make: ["make", "brand"],
  model: ["model"],
  mileage: ["mileage", "odometer", "miles"],
  bodyStyle: ["body style", "body type", "vehicle type"],
  exteriorColor: ["exterior color", "color"],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function findByLabel(aliases: string[]): HTMLElement | null {
  const labels = Array.from(document.querySelectorAll("label"));
  for (const el of labels) {
    const text = normalize(el.textContent ?? "");
    if (!text || text.length > 120) continue;
    if (!aliases.some((a) => text === a || text.startsWith(a) || text.includes(` ${a}`))) {
      // also allow exact alias contained as own word near start
      if (!aliases.some((a) => text.includes(a))) continue;
    }

    const forId = el.htmlFor;
    if (forId) {
      const control = document.getElementById(forId);
      if (control) return control;
    }

    const nested = el.querySelector("input, textarea, [contenteditable='true'], [role='textbox']");
    if (nested instanceof HTMLElement) return nested;

    const sibling = el.nextElementSibling;
    if (sibling instanceof HTMLElement) {
      if (sibling.matches("input, textarea, [contenteditable='true']")) return sibling;
      const nestedSibling = sibling.querySelector(
        "input, textarea, [contenteditable='true']",
      );
      if (nestedSibling instanceof HTMLElement) return nestedSibling;
    }
  }

  // Fallback: aria/span labels adjacent to controls
  const candidates = Array.from(
    document.querySelectorAll("span, div, [role='text'], p"),
  );
  for (const el of candidates) {
    const text = normalize(el.textContent ?? "");
    if (!text || text.length > 60) continue;
    if (!aliases.some((a) => text === a || text.includes(a))) continue;
    const sibling = el.nextElementSibling;
    if (
      sibling instanceof HTMLElement &&
      sibling.matches("input, textarea, [contenteditable='true']")
    ) {
      return sibling;
    }
    const parentControl = el.parentElement?.querySelector(
      ":scope > input, :scope > textarea, :scope > [contenteditable='true']",
    );
    if (parentControl instanceof HTMLElement) return parentControl;
  }
  return null;
}

function findByPlaceholder(aliases: string[]): HTMLElement | null {
  const controls = Array.from(
    document.querySelectorAll<HTMLElement>("input, textarea, [contenteditable='true']"),
  );
  for (const control of controls) {
    const ph = normalize(
      control.getAttribute("placeholder") ??
        control.getAttribute("aria-label") ??
        control.getAttribute("aria-placeholder") ??
        "",
    );
    if (aliases.some((a) => ph.includes(a))) return control;
  }
  return null;
}

function setNativeValue(el: HTMLElement, value: string) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    );
    proto?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (el.isContentEditable) {
    el.focus();
    el.textContent = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
  }
}

export function detectBlockingUI(): { captchaDetected: boolean; checkpointDetected: boolean } {
  const bodyText = normalize(document.body?.innerText ?? "");
  const captchaDetected =
    !!document.querySelector("iframe[src*='captcha'], [id*='captcha'], [class*='captcha']") ||
    bodyText.includes("security check") ||
    bodyText.includes("confirm you're human") ||
    bodyText.includes("enter the characters");

  const checkpointDetected =
    bodyText.includes("confirm your identity") ||
    bodyText.includes("checkpoint") ||
    !!document.querySelector("[id*='checkpoint']");

  return { captchaDetected, checkpointDetected };
}

export function fillMarketplaceForm(payload: AssistPayload): FillResult {
  const blocking = detectBlockingUI();
  if (blocking.captchaDetected || blocking.checkpointDetected) {
    return {
      filled: [],
      missing: Object.keys(LABEL_ALIASES),
      ...blocking,
    };
  }

  const values: Record<string, string> = {
    title: payload.title,
    price: String(payload.price),
    description: payload.description,
    year: payload.year != null ? String(payload.year) : "",
    make: payload.make ?? "",
    model: payload.model ?? "",
    mileage: payload.mileage != null ? String(payload.mileage) : "",
    bodyStyle: payload.bodyStyle ?? "",
    exteriorColor: payload.exteriorColor ?? "",
  };

  const filled: string[] = [];
  const missing: string[] = [];

  for (const [key, aliases] of Object.entries(LABEL_ALIASES)) {
    const value = values[key];
    if (!value) continue;
    const el = findByLabel(aliases) ?? findByPlaceholder(aliases);
    if (!el) {
      missing.push(key);
      continue;
    }
    setNativeValue(el, value);
    filled.push(key);
  }

  return { filled, missing, captchaDetected: false, checkpointDetected: false };
}
