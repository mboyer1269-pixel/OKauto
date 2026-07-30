/** Popup: shows connection status, lists available inventory, prepares a listing. */
import { getPrefill, listVehicles, recordPrefill, type ExtVehicle } from './lib/api.js';
import { getConfig } from './lib/storage.js';
import { PENDING_KEY, type PendingPrefill } from './lib/messages.js';

const CREATE_URL = 'https://www.facebook.com/marketplace/create/vehicle';

const statusEl = document.getElementById('status') as HTMLDivElement;
const listEl = document.getElementById('list') as HTMLDivElement;
const searchRow = document.getElementById('search-row') as HTMLDivElement;
const searchEl = document.getElementById('search') as HTMLInputElement;
const optionsLink = document.getElementById('options-link') as HTMLAnchorElement;

optionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

function setStatus(html: string, cls = ''): void {
  statusEl.className = `status ${cls}`;
  statusEl.innerHTML = html;
}

function money(cents: number | null): string {
  if (cents === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}

function renderVehicles(vehicles: ExtVehicle[]): void {
  listEl.innerHTML = '';
  if (vehicles.length === 0) {
    listEl.innerHTML = '<div class="muted small" style="padding:10px">No available vehicles.</div>';
    return;
  }
  for (const v of vehicles) {
    const card = document.createElement('div');
    card.className = 'vcard';
    const info = document.createElement('div');
    info.innerHTML = `<div class="vtitle">${escapeHtml(v.title || 'Untitled')}</div>
      <div class="muted small">${money(v.priceCents)} · ${v._count.photos} photos · ${v._count.listings} listings</div>`;
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-sm';
    btn.textContent = 'Prepare';
    btn.addEventListener('click', () => void prepare(v.id, btn));
    card.append(info, btn);
    listEl.appendChild(card);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

async function prepare(vehicleId: string, btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true;
  btn.textContent = 'Preparing…';
  try {
    const payload = await getPrefill(vehicleId);
    const listing = await recordPrefill(vehicleId, payload.fields.description);
    const pending: PendingPrefill = { listingId: listing.id, payload, createdAt: Date.now() };
    await chrome.storage.local.set({ [PENDING_KEY]: pending });
    await chrome.tabs.create({ url: CREATE_URL });
    window.close();
  } catch (err) {
    setStatus(`Error: ${escapeHtml(String(err))}`, 'error');
    btn.disabled = false;
    btn.textContent = 'Prepare';
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
searchEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void refresh(searchEl.value), 300);
});

async function refresh(q?: string): Promise<void> {
  try {
    const vehicles = await listVehicles(q);
    renderVehicles(vehicles);
  } catch (err) {
    setStatus(`Error loading inventory: ${escapeHtml(String(err))}`, 'error');
  }
}

async function init(): Promise<void> {
  const config = await getConfig();
  if (!config) {
    setStatus('Not connected. <a id="pair" href="#">Open settings to pair</a>.', 'warn');
    document.getElementById('pair')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    return;
  }
  setStatus(`Connected to <strong>${escapeHtml(config.organizationName ?? 'your dealership')}</strong>.`, 'ok');
  searchRow.classList.remove('hidden');
  await refresh();
}

void init();
