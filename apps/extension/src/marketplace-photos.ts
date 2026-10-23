export const PHOTO_PROMPT_LABELS = [
  "ajouter des photos",
  "add photos",
  "téléverser",
  "televerser",
  "upload photos",
  "ajouter des images",
  "add images",
  "photos",
];

export const PHOTO_THUMBNAIL_HINTS = [
  "photo",
  "image",
  "aperçu",
  "apercu",
  "preview",
  "miniature",
];

export function isPhotoFileInput(element: Element | null): element is HTMLInputElement {
  return element instanceof HTMLInputElement && element.type === "file";
}

export function scorePhotoInput(input: HTMLInputElement): number {
  let score = 0;
  const accept = (input.accept ?? "").toLowerCase();
  if (accept.includes("image")) score += 4;
  if (accept.includes("heif") || accept.includes("heic")) score += 2;
  if (input.multiple) score += 2;
  if (!input.disabled) score += 1;
  return score;
}

export function pickPhotoFileInput(
  candidates: Array<Element | null | undefined>,
): HTMLInputElement | null {
  const inputs = candidates.filter(isPhotoFileInput);
  if (inputs.length === 0) return null;
  return [...inputs].sort((left, right) => scorePhotoInput(right) - scorePhotoInput(left))[0];
}

export function findPhotoFileInput(root: ParentNode = document): HTMLInputElement | null {
  return pickPhotoFileInput(
    Array.from(root.querySelectorAll('input[type="file"][accept*="image"]')),
  );
}

export function elementLooksLikePhotoPrompt(element: Element): boolean {
  const text = `${element.getAttribute("aria-label") ?? ""} ${element.textContent ?? ""}`
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr-CA");
  if (!text) return false;
  return PHOTO_PROMPT_LABELS.some((label) => text.includes(label));
}

export function revealPhotoPrompt(root: ParentNode = document): boolean {
  const prompt = Array.from(
    root.querySelectorAll('[role="button"], button, [aria-label]'),
  ).find(elementLooksLikePhotoPrompt);
  if (!prompt) return false;
  prompt.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  return true;
}

export function waitForPredicate(
  predicate: () => boolean,
  timeoutMs = 8000,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (predicate()) {
      resolve(true);
      return;
    }
    const observer = new MutationObserver(() => {
      if (predicate()) {
        cleanup();
        resolve(true);
      }
    });
    const timer = window.setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    function cleanup() {
      observer.disconnect();
      window.clearTimeout(timer);
    }
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  });
}

export async function waitForPhotoFileInput(
  timeoutMs = 8000,
): Promise<HTMLInputElement | null> {
  const existing = findPhotoFileInput();
  if (existing) return existing;
  revealPhotoPrompt();
  await waitForPredicate(() => findPhotoFileInput() != null, timeoutMs);
  return findPhotoFileInput();
}

export function assignFilesToInput(input: HTMLInputElement, files: File[]): number {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "files",
  )?.set;
  setter?.call(input, transfer.files);
  if (!setter) input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return input.files?.length ?? 0;
}

export function countPhotoThumbnails(root: ParentNode = document): number {
  return Array.from(root.querySelectorAll("img")).filter((img) => {
    if (img.closest("#okauto-assist-banner")) return false;
    const src = img.currentSrc || img.src || "";
    if (src.startsWith("blob:") || src.startsWith("data:")) return true;
    const label = `${img.alt} ${img.getAttribute("aria-label") ?? ""}`.toLowerCase();
    return PHOTO_THUMBNAIL_HINTS.some((hint) => label.includes(hint));
  }).length;
}

export async function waitForPhotoThumbnails(
  minCount: number,
  timeoutMs = 8000,
): Promise<number> {
  let latest = countPhotoThumbnails();
  if (latest >= minCount) return latest;
  await waitForPredicate(() => {
    latest = countPhotoThumbnails();
    return latest >= minCount;
  }, timeoutMs);
  return latest;
}

export function photoResponseToFile(
  response: {
    success?: boolean;
    base64?: string;
    contentType?: string;
    filename?: string;
  },
  fallbackName: string,
): File | null {
  if (!response.success || !response.base64) return null;
  const binary = atob(response.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], response.filename ?? fallbackName, {
    type: response.contentType ?? "image/jpeg",
  });
}
