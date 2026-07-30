import { matchesPattern, normalizeText } from "./selector-engine.js";

/**
 * React-compatible value setter: modern SPAs listen to synthetic events fed by
 * native setters, so we set through the prototype descriptor and then dispatch.
 */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  descriptor?.set?.call(el, value);
}

export function fillText(el: Element, value: string): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.focus();
    setNativeValue(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  if (el instanceof HTMLElement && el.isContentEditable) {
    el.focus();
    el.textContent = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    return true;
  }
  return false;
}

/** Clicks a combobox trigger, then selects the option whose text best matches. */
export async function pickDropdownOption(
  root: ParentNode,
  trigger: Element,
  optionText: string,
  waitMs = 400,
): Promise<boolean> {
  (trigger as HTMLElement).click();
  await new Promise((resolve) => setTimeout(resolve, waitMs));

  const doc = (root instanceof Document ? root : root.ownerDocument) ?? document;
  const wanted = normalizeText(optionText);
  const candidates = [
    ...doc.querySelectorAll("[role='option']"),
    ...doc.querySelectorAll("[role='listbox'] [role='option']"),
    ...doc.querySelectorAll("ul li"),
  ];
  let best: Element | null = null;
  for (const option of candidates) {
    const text = option.textContent ?? "";
    if (matchesPattern(text, wanted)) {
      best = option;
      break;
    }
  }
  if (!best) {
    // Close whatever opened so the user isn't left with a stuck menu.
    doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return false;
  }
  (best as HTMLElement).click();
  return true;
}

export interface StagedPhoto {
  name: string;
  type: string;
  bytes: Uint8Array;
}

/** Stages downloaded photos into a file input via DataTransfer (injectable for tests). */
export function stagePhotos(input: HTMLInputElement, photos: StagedPhoto[], dataTransfer?: DataTransfer): number {
  if (photos.length === 0) return 0;
  const dt = dataTransfer ?? new DataTransfer();
  for (const photo of photos) {
    const file = new File([photo.bytes as unknown as BlobPart], photo.name, { type: photo.type });
    dt.items.add(file);
  }
  input.files = dt.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return dt.files.length;
}

export function formatPriceForInput(priceCents: number): string {
  return String(Math.round(priceCents / 100));
}

export function formatMileageForInput(mileage: number): string {
  return String(mileage);
}
