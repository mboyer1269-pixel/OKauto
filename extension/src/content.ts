import type { FillResult, PreparationPayload } from "./types";

type Editable = HTMLInputElement | HTMLTextAreaElement;

const fieldAliases: Record<string, string[]> = {
  title: ["title", "listing title"],
  price: ["price"],
  description: ["description"],
  mileage: ["mileage", "odometer"],
};

function visible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  const box = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
}

function editableForLabel(label: HTMLLabelElement): Editable | null {
  const control = label.control;
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) return control;
  const nested = label.querySelector("input, textarea");
  return nested instanceof HTMLInputElement || nested instanceof HTMLTextAreaElement ? nested : null;
}

function findEditable(aliases: string[]): Editable | null {
  const normalized = aliases.map((value) => value.toLowerCase());
  for (const label of document.querySelectorAll("label")) {
    const text = label.textContent?.trim().toLowerCase() ?? "";
    if (normalized.some((alias) => text === alias || text.startsWith(`${alias} `) || text.includes(alias))) {
      const control = editableForLabel(label);
      if (control && !control.disabled && visible(control)) return control;
    }
  }
  for (const element of document.querySelectorAll<Editable>("input, textarea")) {
    const identity = [element.getAttribute("aria-label"), element.getAttribute("name"), element.getAttribute("placeholder")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (normalized.some((alias) => identity.includes(alias)) && !element.disabled && visible(element)) return element;
  }
  return null;
}

function assignValue(element: Editable, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function fill(payload: PreparationPayload): FillResult {
  if (!location.hostname.endsWith("facebook.com") || !location.pathname.startsWith("/marketplace/create")) {
    return { filled: [], missing: [], message: "Open a supported Marketplace create page before preparing fields." };
  }
  if (new Date(payload.expiresAt) <= new Date()) {
    return { filled: [], missing: [], message: "This preparation expired. Return to DriveFlow and prepare it again." };
  }

  const values: Record<string, string> = {
    title: payload.title,
    price: String(payload.price),
    description: payload.description,
    mileage: payload.mileage === null ? "" : String(payload.mileage),
  };
  const filled: string[] = [];
  const missing: string[] = [];
  for (const [field, aliases] of Object.entries(fieldAliases)) {
    if (!values[field]) continue;
    const element = findEditable(aliases);
    if (!element) {
      missing.push(field);
      continue;
    }
    assignValue(element, values[field]);
    filled.push(field);
  }

  return {
    filled,
    missing,
    message: missing.length
      ? `Prepared ${filled.length} fields. Complete ${missing.join(", ")} manually; the page layout may have changed.`
      : "Fields prepared. Review every value, add the downloaded photos, and publish manually when ready.",
  };
}

chrome.runtime.onMessage.addListener(
  (
    message: { type?: string; payload?: PreparationPayload },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: FillResult) => void,
  ) => {
    if (message.type !== "DRIVEFLOW_FILL" || !message.payload) return false;
    sendResponse(fill(message.payload));
    return false;
  },
);
