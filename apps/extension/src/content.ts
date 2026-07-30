/**
 * Marketplace content script. Reads a pending prefill queued by the popup and renders an
 * assistive overlay. On the user's explicit click, it PRE-FILLS supported composer fields
 * using the resilient adapter strategies. It never submits the form, attaches photos
 * automatically, or bypasses any Facebook control — the human reviews and posts.
 */
import type { FieldAdapter, FieldStrategy, MarketplaceVehicleFields } from '@okauto/shared';
import type { BgMessage } from './lib/messages.js';
import { PENDING_KEY, type PendingPrefill } from './lib/messages.js';

const PANEL_ID = 'okauto-assist-panel';

function findByStrategy(strategy: FieldStrategy): HTMLElement | null {
  const esc = (v: string) => v.replace(/"/g, '\\"');
  switch (strategy.kind) {
    case 'aria-label':
      return document.querySelector<HTMLElement>(`[aria-label*="${esc(strategy.value)}" i]`);
    case 'placeholder':
      return document.querySelector<HTMLElement>(`[placeholder*="${esc(strategy.value)}" i]`);
    case 'name':
      return document.querySelector<HTMLElement>(`[name="${esc(strategy.value)}"]`);
    case 'data-testid':
      return document.querySelector<HTMLElement>(`[data-testid*="${esc(strategy.value)}"]`);
    case 'role':
      return document.querySelector<HTMLElement>(`[role="${esc(strategy.value)}"]`);
    case 'label-text': {
      const labels = Array.from(document.querySelectorAll('label'));
      const label = labels.find((l) =>
        (l.textContent ?? '').toLowerCase().includes(strategy.value.toLowerCase()),
      );
      if (!label) return null;
      const forId = label.getAttribute('for');
      if (forId) {
        const el = document.getElementById(forId);
        if (el) return el as HTMLElement;
      }
      return label.querySelector<HTMLElement>('input, textarea, [role="combobox"]');
    }
    default:
      return null;
  }
}

function findField(adapter: FieldAdapter): { el: HTMLElement; strategy: FieldStrategy } | null {
  for (const strategy of adapter.strategies) {
    const el = findByStrategy(strategy);
    if (el) return { el, strategy };
  }
  return null;
}

/** Set an input/textarea value in a way that React's controlled inputs recognize. */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

interface FillReport {
  filled: string[];
  manual: string[];
}

function applyPrefill(fields: MarketplaceVehicleFields, adapters: PendingPrefill['payload']['adapter']): FillReport {
  const report: FillReport = { filled: [], manual: [] };
  const valueFor: Record<string, string | undefined> = {
    year: fields.year,
    make: fields.make,
    model: fields.model,
    mileage: fields.mileage,
    price: fields.price,
    bodyStyle: fields.bodyStyle,
    exteriorColor: fields.exteriorColor,
    interiorColor: fields.interiorColor,
    fuelType: fields.fuelType,
    transmission: fields.transmission,
    description: fields.description,
  };

  for (const fieldAdapter of adapters.fields) {
    const value = valueFor[fieldAdapter.field];
    if (!value) continue;
    const found = findField(fieldAdapter);
    if (!found) {
      report.manual.push(fieldAdapter.field);
      continue;
    }
    const el = found.el;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      setNativeValue(el, value);
      report.filled.push(fieldAdapter.field);
    } else {
      // Custom comboboxes (dropdowns) can't be safely auto-selected; focus for the user.
      el.scrollIntoView({ block: 'center' });
      report.manual.push(fieldAdapter.field);
    }
  }
  return report;
}

function styleButton(btn: HTMLButtonElement, primary = false): void {
  btn.style.cssText = `
    display:block;width:100%;margin:6px 0;padding:9px 12px;border-radius:8px;cursor:pointer;
    font-weight:600;font-size:13px;border:1px solid ${primary ? '#4f7cff' : '#33436a'};
    background:${primary ? '#4f7cff' : '#1b2745'};color:#fff;`;
}

function renderPanel(pending: PendingPrefill): void {
  document.getElementById(PANEL_ID)?.remove();

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'OKauto listing assistant');
  panel.style.cssText = `
    position:fixed;top:16px;right:16px;width:320px;z-index:2147483647;
    background:#121a30;color:#e8edf7;border:1px solid #263453;border-radius:12px;
    box-shadow:0 12px 40px rgba(0,0,0,.5);padding:14px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;
    font-size:13px;line-height:1.45;`;

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:800;font-size:15px;margin-bottom:2px;';
  title.textContent = 'OKauto assistant';
  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'color:#93a1c0;margin-bottom:10px;';
  subtitle.textContent = pending.payload.vehicle.title;

  const note = document.createElement('div');
  note.style.cssText =
    'background:#0b1020;border:1px solid #263453;border-radius:8px;padding:8px;margin-bottom:10px;color:#93a1c0;';
  note.textContent =
    'Assistive only: fields are pre-filled for your review. You add photos and click Post yourself.';

  const fillBtn = document.createElement('button');
  fillBtn.textContent = 'Pre-fill form fields';
  styleButton(fillBtn, true);

  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy description';
  styleButton(copyBtn);

  const postedBtn = document.createElement('button');
  postedBtn.textContent = 'Mark as posted';
  styleButton(postedBtn);

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'Dismiss';
  styleButton(dismissBtn);

  const status = document.createElement('div');
  status.style.cssText = 'margin-top:8px;color:#93a1c0;min-height:18px;';

  const photos = document.createElement('div');
  if (pending.payload.photoUrls.length > 0) {
    photos.style.cssText = 'margin-top:8px;color:#93a1c0;';
    photos.innerHTML = `<strong>${pending.payload.photoUrls.length} photo(s)</strong> to add manually:`;
    const list = document.createElement('div');
    list.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;';
    for (const url of pending.payload.photoUrls.slice(0, 6)) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.textContent = 'photo';
      a.style.cssText = 'font-size:11px;color:#93b4ff;';
      list.appendChild(a);
    }
    photos.appendChild(list);
  }

  fillBtn.addEventListener('click', () => {
    const report = applyPrefill(pending.payload.fields, pending.payload.adapter);
    status.textContent = `Filled: ${report.filled.join(', ') || 'none'}. Manual: ${report.manual.join(', ') || 'none'}.`;
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pending.payload.fields.description);
      status.textContent = 'Description copied to clipboard.';
    } catch {
      status.textContent = 'Could not access clipboard.';
    }
  });

  postedBtn.addEventListener('click', () => {
    const message: BgMessage = {
      type: 'SET_STATUS',
      listingId: pending.listingId,
      status: 'ACTIVE',
      externalUrl: location.href,
    };
    chrome.runtime.sendMessage(message, (res?: { ok: boolean; error?: string }) => {
      status.textContent = res?.ok ? 'Marked as posted in OKauto.' : `Failed: ${res?.error ?? 'unknown'}`;
      if (res?.ok) void chrome.storage.local.remove(PENDING_KEY);
    });
  });

  dismissBtn.addEventListener('click', () => {
    panel.remove();
    void chrome.storage.local.remove(PENDING_KEY);
  });

  panel.append(title, subtitle, note, fillBtn, copyBtn, postedBtn, dismissBtn, status, photos);
  document.body.appendChild(panel);
}

async function init(): Promise<void> {
  const stored = await chrome.storage.local.get(PENDING_KEY);
  const pending = stored[PENDING_KEY] as PendingPrefill | undefined;
  if (pending && pending.payload?.vehicle) {
    renderPanel(pending);
  }
}

void init();
