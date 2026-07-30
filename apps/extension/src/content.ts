import type { ExtMessage, MessageResponse, PendingListing } from "./types.js";

/**
 * Marketplace listing assistant (content script).
 *
 * When the user starts a listing from the side panel, this script mounts a
 * small overlay on the Marketplace "create vehicle" page. On explicit user
 * click it pre-fills the form fields from the vehicle draft using resilient,
 * label-based selectors, then the HUMAN reviews, adds photos, and clicks
 * Facebook's own Publish button. The script never submits the form, never
 * interacts with anti-bot mechanisms, and acts only on user action.
 */

/* ------------------------------------------------------------------ */
/* Field adapter: resilient label-based lookups                        */
/* ------------------------------------------------------------------ */

interface FillResult {
  field: string;
  ok: boolean;
  note?: string;
}

function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function visible(el: Element): boolean {
  const rect = (el as HTMLElement).getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** Find a text input/textarea whose label or aria-label matches a candidate. */
function findTextControl(labelCandidates: string[]): HTMLInputElement | HTMLTextAreaElement | null {
  const wanted = labelCandidates.map(normalizeText);
  // aria-label direct match.
  for (const el of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    "input[aria-label], textarea[aria-label]",
  )) {
    const label = normalizeText(el.getAttribute("aria-label") ?? "");
    if (wanted.some((w) => label === w || label.startsWith(w)) && visible(el)) return el;
  }
  // <label> wrapping an input (Facebook's usual pattern).
  for (const label of document.querySelectorAll("label")) {
    const text = normalizeText(label.textContent ?? "");
    if (!wanted.some((w) => text === w || text.startsWith(w))) continue;
    const control = label.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    if (control && visible(control)) return control;
  }
  return null;
}

/** Find a dropdown trigger (combobox) by its visible label text. */
function findDropdownTrigger(labelCandidates: string[]): HTMLElement | null {
  const wanted = labelCandidates.map(normalizeText);
  const selectors = ['[role="combobox"]', 'label[role="button"]', 'div[role="button"]'];
  for (const selector of selectors) {
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      const label = normalizeText(el.getAttribute("aria-label") ?? "") || normalizeText(el.textContent ?? "");
      if (wanted.some((w) => label === w || label.startsWith(w)) && visible(el)) return el;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor<T>(fn: () => T | null, timeoutMs = 3000, stepMs = 100): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = fn();
    if (value) return value;
    await sleep(stepMs);
  }
  return null;
}

async function fillText(field: string, labels: string[], value: string | undefined): Promise<FillResult> {
  if (!value) return { field, ok: true, note: "no value; skipped" };
  const control = findTextControl(labels);
  if (!control) return { field, ok: false, note: "field not found — enter manually" };
  setNativeValue(control, value);
  return { field, ok: true };
}

/** Open a dropdown and choose the first option matching any candidate label. */
async function fillDropdown(field: string, labels: string[], optionCandidates: string[] | undefined): Promise<FillResult> {
  if (!optionCandidates || optionCandidates.length === 0) return { field, ok: true, note: "no value; skipped" };
  const trigger = findDropdownTrigger(labels);
  if (!trigger) return { field, ok: false, note: "dropdown not found — choose manually" };
  trigger.click();
  const wanted = optionCandidates.map(normalizeText);
  const option = await waitFor(() => {
    for (const opt of document.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"], [role="menu"] [role="menuitem"]')) {
      const text = normalizeText(opt.textContent ?? "");
      if (wanted.some((w) => text === w || text.startsWith(w))) return opt;
    }
    return null;
  }, 2500);
  if (!option) {
    // Close the dropdown to leave the page usable.
    document.body.click();
    return { field, ok: false, note: `option "${optionCandidates[0]}" not found — choose manually` };
  }
  option.click();
  await sleep(150);
  return { field, ok: true };
}

async function fillMarketplaceForm(draft: PendingListing["draft"]): Promise<FillResult[]> {
  const results: FillResult[] = [];
  results.push(await fillDropdown("Vehicle type", ["vehicle type"], [draft.vehicleType, "Car/van", "Car"]));
  await sleep(400); // the rest of the form renders after vehicle type is set
  results.push(await fillDropdown("Year", ["year"], [draft.year]));
  results.push(await fillDropdown("Make", ["make"], [draft.make]));
  results.push(await fillText("Model", ["model"], draft.model));
  results.push(await fillText("Mileage", ["mileage"], draft.mileage));
  results.push(await fillText("Price", ["price"], draft.price));
  results.push(await fillDropdown("Body style", ["body style"], draft.bodyStyleLabels));
  results.push(await fillDropdown("Exterior color", ["exterior color", "exterior colour"], draft.exteriorColor ? [draft.exteriorColor] : undefined));
  results.push(await fillDropdown("Interior color", ["interior color", "interior colour"], draft.interiorColor ? [draft.interiorColor] : undefined));
  results.push(await fillDropdown("Condition", ["vehicle condition", "condition"], draft.conditionLabels));
  results.push(await fillDropdown("Fuel type", ["fuel type"], draft.fuelLabels));
  results.push(await fillDropdown("Transmission", ["transmission"], draft.transmissionLabels));
  results.push(await fillText("Description", ["description"], draft.description));
  return results;
}

/* ------------------------------------------------------------------ */
/* Overlay UI (shadow DOM to avoid style collisions)                   */
/* ------------------------------------------------------------------ */

function sendMessage(message: ExtMessage): Promise<MessageResponse> {
  return chrome.runtime.sendMessage(message);
}

let mounted = false;

function mountOverlay(pending: PendingListing): void {
  if (mounted) return;
  mounted = true;

  const host = document.createElement("div");
  host.id = "openlot-overlay-host";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      .card { position: fixed; bottom: 16px; right: 16px; z-index: 2147483647; width: 320px;
        background: #0f172a; color: #e2e8f0; border-radius: 12px; padding: 14px;
        font: 13px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; box-shadow: 0 8px 30px rgba(0,0,0,.35); }
      .title { font-weight: 700; font-size: 13px; margin: 0 0 2px; color: #fff; }
      .sub { color: #94a3b8; font-size: 11px; margin: 0 0 10px; }
      .row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
      button { border: 0; border-radius: 8px; padding: 7px 10px; font-size: 12px; font-weight: 600; cursor: pointer; }
      .primary { background: #6366f1; color: #fff; }
      .primary:hover { background: #4f46e5; }
      .secondary { background: #1e293b; color: #cbd5e1; }
      .secondary:hover { background: #334155; }
      .success { background: #059669; color: #fff; }
      .danger { background: #7f1d1d; color: #fecaca; }
      .status { font-size: 11px; color: #a5b4fc; min-height: 15px; white-space: pre-wrap; }
      .close { position: absolute; top: 8px; right: 10px; background: none; color: #64748b; font-size: 14px; padding: 2px; }
      .note { font-size: 10px; color: #64748b; margin-top: 8px; }
    </style>
    <div class="card" role="dialog" aria-label="OpenLot listing assistant">
      <button class="close" title="Dismiss" aria-label="Dismiss">✕</button>
      <p class="title">OpenLot · ${escapeHtml(pending.draft.title)}</p>
      <p class="sub">Auto-fill the form, then review everything, add photos, and publish yourself.</p>
      <div class="row">
        <button class="primary" id="fill">⚡ Auto-fill form</button>
        <button class="secondary" id="copy-desc">Copy description</button>
        ${pending.draft.photoUrls.length > 0 ? '<button class="secondary" id="copy-photos">Copy photo URLs</button>' : ""}
      </div>
      <div class="row">
        <button class="success" id="published">✓ I published it</button>
        <button class="danger" id="failed">Something failed</button>
      </div>
      <div class="status" id="status"></div>
      <p class="note">OpenLot never publishes for you and never bypasses Facebook's protections. You stay in control.</p>
    </div>
  `;
  document.documentElement.appendChild(host);

  const status = shadow.getElementById("status")!;
  const say = (text: string) => {
    status.textContent = text;
  };

  shadow.getElementById("fill")!.addEventListener("click", async () => {
    say("Filling form…");
    try {
      const results = await fillMarketplaceForm(pending.draft);
      const failed = results.filter((r) => !r.ok);
      const filled = results.filter((r) => r.ok && !r.note).length;
      if (failed.length === 0) {
        say(`Filled ${filled} fields. Review them, add photos, then publish.`);
      } else {
        say(
          `Filled ${filled} fields. Needs manual attention:\n` +
            failed.map((f) => `• ${f.field}: ${f.note ?? "not filled"}`).join("\n"),
        );
      }
      await sendMessage({ kind: "LISTING_EVENT", type: "PREPARED", message: `Auto-filled ${filled} fields via extension` });
    } catch (err) {
      say(`Auto-fill error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  shadow.getElementById("copy-desc")!.addEventListener("click", async () => {
    await navigator.clipboard.writeText(pending.draft.description);
    say("Description copied to clipboard.");
  });

  shadow.getElementById("copy-photos")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(pending.draft.photoUrls.join("\n"));
    say(`${pending.draft.photoUrls.length} photo URLs copied. Download them and add to the listing.`);
  });

  shadow.getElementById("published")!.addEventListener("click", async () => {
    const remoteUrl = /marketplace\/item\//.test(location.href) ? location.href : undefined;
    const res = await sendMessage({
      kind: "LISTING_EVENT",
      type: "PUBLISHED",
      message: "Confirmed published by user",
      remoteUrl,
    });
    if (res.ok) {
      say("Recorded! Your dashboard and manager analytics are updated.");
      setTimeout(() => host.remove(), 2500);
    } else {
      say(`Could not record: ${res.error ?? "unknown error"}`);
    }
  });

  shadow.getElementById("failed")!.addEventListener("click", async () => {
    await sendMessage({ kind: "LISTING_EVENT", type: "FAILED", message: "User reported a failure during listing" });
    say("Recorded as failed. You can retry from the side panel.");
  });

  shadow.querySelector(".close")!.addEventListener("click", async () => {
    await sendMessage({ kind: "CLEAR_PENDING" });
    host.remove();
    mounted = false;
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/* ------------------------------------------------------------------ */
/* Bootstrapping — handles Facebook's SPA navigation                   */
/* ------------------------------------------------------------------ */

async function checkAndMount(): Promise<void> {
  if (mounted) return;
  if (!/marketplace\/(create|item)/.test(location.pathname + location.href)) return;
  try {
    const res = await sendMessage({ kind: "GET_PENDING" });
    if (res.ok && res.pending) mountOverlay(res.pending);
  } catch {
    // Extension context might be reloading; ignore.
  }
}

void checkAndMount();
setInterval(() => void checkAndMount(), 1500);
