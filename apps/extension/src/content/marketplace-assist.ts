import type { AssistReport, FieldFillResult, FillableField } from "@okauto/shared";
import { MARKETPLACE_YOU_URL } from "@okauto/shared";
import { DEFAULT_ADAPTER_CONFIG } from "../lib/adapter-config.js";
import { resolveField, waitForElement } from "../lib/selector-engine.js";
import {
  fillText,
  formatMileageForInput,
  formatPriceForInput,
  pickDropdownOption,
  stagePhotos,
  type StagedPhoto,
} from "../lib/field-fillers.js";
import { AssistOverlay } from "./overlay.js";

interface AssistPayload {
  listingId: string;
  title: string;
  description: string;
  priceCents: number;
  vehicle: {
    year: number | null;
    make: string;
    model: string;
    mileage: number | null;
    bodyStyle: string | null;
    fuelType: string | null;
    transmission: string | null;
    condition: string | null;
  };
  photoUrls: string[];
}

interface RemovalPayload {
  listingId: string;
  title: string;
  externalUrl: string | null;
}

type Outcome =
  | { kind: "LIVE"; externalUrl: string }
  | { kind: "ATTENTION"; reason: string };

const FILL_DELAY_MS = 350;
const PUBLISH_DETECT_INTERVAL_MS = 1500;
const PUBLISH_DETECT_TIMEOUT_MS = 15 * 60 * 1000;

let assistRunning = false;

function extractMarketplaceItemUrl(url: string): string | null {
  const match = url.match(/facebook\.com\/marketplace\/item\/(\d+)/);
  return match ? `https://www.facebook.com/marketplace/item/${match[1]}` : null;
}

async function fetchPhotos(urls: string[], cap = 20): Promise<StagedPhoto[]> {
  const staged: StagedPhoto[] = [];
  for (const [index, url] of urls.slice(0, cap).entries()) {
    try {
      const result = await chrome.runtime.sendMessage({
        type: "FETCH_PHOTO",
        url,
      });
      if (!result?.ok || !result.blobBase64) continue;
      const binary = atob(result.blobBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const extension = (result.contentType ?? "image/jpeg").split("/")[1] ?? "jpg";
      staged.push({
        name: `photo-${index + 1}.${extension.replace(/[^a-z]/gi, "") || "jpg"}`,
        type: result.contentType ?? "image/jpeg",
        bytes,
      });
    } catch {
      // A single photo failure never aborts the assist.
    }
  }
  return staged;
}

async function fillField(
  report: AssistReport,
  field: FillableField,
  strategies: (typeof DEFAULT_ADAPTER_CONFIG)[FillableField],
  fill: (el: Element) => Promise<boolean> | boolean,
): Promise<void> {
  const outcome = await waitForElement(document, strategies, 4000);
  const result: FieldFillResult = {
    field,
    ok: false,
    strategyIndex: outcome.strategyIndex,
    strategyKind: outcome.strategyKind,
    attempts: outcome.attempts,
  };
  if (!outcome.el) {
    result.error = "field not found";
  } else {
    try {
      result.ok = await fill(outcome.el);
      if (!result.ok) result.error = "fill rejected";
    } catch (err) {
      result.error = err instanceof Error ? err.message : "fill failed";
    }
  }
  report.fieldResults.push(result);
  await new Promise((resolve) => setTimeout(resolve, FILL_DELAY_MS));
}

function watchForPublish(listingId: string, resolve: (outcome: Outcome) => void): void {
  const started = Date.now();
  const timer = setInterval(() => {
    const itemUrl = extractMarketplaceItemUrl(window.location.href);
    if (itemUrl) {
      clearInterval(timer);
      resolve({ kind: "LIVE", externalUrl: itemUrl });
      return;
    }
    if (Date.now() - started > PUBLISH_DETECT_TIMEOUT_MS) {
      clearInterval(timer);
      resolve({ kind: "ATTENTION", reason: "Publish detection timed out" });
    }
  }, PUBLISH_DETECT_INTERVAL_MS);
  void listingId;
}

async function runAssist(payload: AssistPayload): Promise<Outcome> {
  if (assistRunning) return { kind: "ATTENTION", reason: "An assist is already running on this tab" };
  assistRunning = true;

  const report: AssistReport = {
    startedAt: new Date().toISOString(),
    finishedAt: "",
    fieldResults: [],
    photosStaged: 0,
    aborted: false,
  };

  return new Promise<Outcome>((resolve) => {
    const finish = (outcome: Outcome) => {
      report.finishedAt = new Date().toISOString();
      report.aborted = outcome.kind === "ATTENTION";
      if (outcome.kind === "ATTENTION") report.abortReason = outcome.reason;
      overlay.unmount();
      assistRunning = false;
      resolve(outcome);
    };

    const overlay = new AssistOverlay({
      onAbort: (reason) => finish({ kind: "ATTENTION", reason }),
      onManualDone: () => {
        const itemUrl = extractMarketplaceItemUrl(window.location.href);
        if (itemUrl) finish({ kind: "LIVE", externalUrl: itemUrl });
        else {
          overlay.setStatus("No listing URL detected yet — publish first, then click again, or Abort.");
        }
      },
    });
    overlay.mount();
    overlay.setStatus("Filling form…");
    overlay.renderChecklist(report);

    void (async () => {
      const config = DEFAULT_ADAPTER_CONFIG;
      await fillField(report, "title", config.title, (el) => fillText(el, payload.title));
      overlay.renderChecklist(report);
      await fillField(report, "price", config.price, (el) => fillText(el, formatPriceForInput(payload.priceCents)));
      overlay.renderChecklist(report);
      await fillField(report, "description", config.description, (el) => fillText(el, payload.description));
      overlay.renderChecklist(report);
      if (payload.vehicle.year) {
        await fillField(report, "year", config.year, async (el) => {
          if ((el as HTMLElement).getAttribute("role") === "combobox") {
            return pickDropdownOption(document, el, String(payload.vehicle.year));
          }
          return fillText(el, String(payload.vehicle.year));
        });
      }
      await fillField(report, "make", config.make, async (el) => {
        if ((el as HTMLElement).getAttribute("role") === "combobox") {
          return pickDropdownOption(document, el, payload.vehicle.make);
        }
        return fillText(el, payload.vehicle.make);
      });
      await fillField(report, "model", config.model, (el) => fillText(el, payload.vehicle.model));
      if (payload.vehicle.mileage != null) {
        await fillField(report, "mileage", config.mileage, (el) =>
          fillText(el, formatMileageForInput(payload.vehicle.mileage!)),
        );
      }
      overlay.renderChecklist(report);

      // Photos (best effort).
      overlay.setStatus("Staging photos…");
      const photos = await fetchPhotos(payload.photoUrls);
      const inputOutcome = resolveField(document, config.photos);
      if (inputOutcome.el && photos.length > 0) {
        report.photosStaged = stagePhotos(inputOutcome.el as HTMLInputElement, photos);
      }
      overlay.renderChecklist(report);

      overlay.setStatus(
        "Review the listing, then publish it yourself. We'll detect the publish and report back automatically.",
      );
      watchForPublish(payload.listingId, finish);
    })().catch((err) => {
      finish({ kind: "ATTENTION", reason: err instanceof Error ? err.message : "Unexpected assist failure" });
    });
  });
}

function highlightListingCard(title: string): boolean {
  const wanted = title.trim().toLowerCase();
  if (!wanted) return false;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const matches: HTMLElement[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.textContent?.trim().toLowerCase() === wanted) {
      const el = node.parentElement;
      if (el) matches.push(el);
    }
  }
  const card = matches[0]?.closest("a, [role='button'], div") ?? matches[0];
  if (!card) return false;
  (card as HTMLElement).style.outline = "3px solid #0d9488";
  (card as HTMLElement).style.outlineOffset = "2px";
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}

async function runRemovalAssist(payload: RemovalPayload): Promise<void> {
  if (!window.location.pathname.startsWith("/marketplace/you")) {
    window.location.href = MARKETPLACE_YOU_URL;
    return; // script re-runs after navigation; background re-sends the payload
  }
  const overlay = new AssistOverlay({
    onAbort: (reason) => {
      void chrome.runtime.sendMessage({
        type: "REMOVAL_DONE",
        listingId: payload.listingId,
        ok: false,
        reason,
      });
      overlay.unmount();
    },
    onManualDone: () => {
      void chrome.runtime.sendMessage({
        type: "REMOVAL_DONE",
        listingId: payload.listingId,
        ok: true,
      });
      overlay.unmount();
    },
  });
  overlay.mount();
  const found = highlightListingCard(payload.title);
  overlay.setStatus(
    found
      ? "Listing highlighted. Open it and delete it yourself — then click “I've published…” (renamed: done) to confirm removal."
      : "Could not find the listing automatically. Delete it from this page, then confirm.",
  );
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "ASSIST_BEGIN") {
    void runAssist(message.payload as AssistPayload).then((outcome) => {
      void chrome.runtime.sendMessage({
        type: "ASSIST_DONE",
        listingId: (message.payload as AssistPayload).listingId,
        outcome,
      });
    });
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === "REMOVAL_BEGIN") {
    void runRemovalAssist(message.payload as RemovalPayload);
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
