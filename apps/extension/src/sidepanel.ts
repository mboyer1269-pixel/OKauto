import { api } from './api.js';

const qEl = document.getElementById('q') as HTMLInputElement;
const listEl = document.getElementById('list') as HTMLDivElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;
const searchBtn = document.getElementById('search') as HTMLButtonElement;

type Vehicle = {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  price: number | null;
  mileage: number | null;
  vin: string | null;
  stockNumber: string | null;
  status: string;
  exteriorColor: string | null;
};

async function load() {
  statusEl.textContent = 'Loading inventory…';
  statusEl.className = 'muted';
  try {
    const params = new URLSearchParams();
    if (qEl.value.trim()) params.set('q', qEl.value.trim());
    params.set('pageSize', '30');
    const res = await api<{ items: Vehicle[] }>(`/v1/vehicles?${params}`);
    listEl.innerHTML = '';
    for (const v of res.items) {
      const el = document.createElement('div');
      el.className = 'item';
      const title = [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ');
      el.innerHTML = `
        <h3>${title}</h3>
        <div class="muted">${v.stockNumber ?? '—'} · ${v.vin ?? '—'} · ${v.status}</div>
        <div class="muted">${v.price != null ? `$${v.price.toLocaleString()}` : 'No price'} · ${v.mileage?.toLocaleString() ?? '—'} mi</div>
        <div class="row" style="margin-top:8px">
          <button data-prepare="${v.id}">Prepare & fill</button>
          <button class="secondary" data-copy="${v.id}">Copy payload</button>
        </div>
      `;
      listEl.appendChild(el);
    }
    statusEl.textContent = `${res.items.length} vehicles`;
  } catch (e) {
    statusEl.textContent = e instanceof Error ? e.message : 'Failed to load';
    statusEl.className = 'error';
  }
}

async function prepareAndFill(vehicleId: string) {
  statusEl.textContent = 'Preparing listing…';
  const prepared = await api<{
    listingId: string;
    payload: {
      listingId: string;
      title: string;
      price: number | null;
      description: string;
      mileage: number | null;
      year: number | null;
      make: string | null;
      model: string | null;
      exteriorColor: string | null;
    };
  }>(`/v1/vehicles/${vehicleId}/prepare-listing`, {
    method: 'POST',
    body: JSON.stringify({ regenerateDescription: true }),
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: 'OKAUTO_FILL',
    payload: prepared.payload,
  });

  if (!response?.ok) {
    throw new Error(response?.error ?? 'Fill failed — open Marketplace create page first');
  }

  await api(`/v1/listings/${prepared.listingId}/events`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'filled',
      meta: response.result,
    }),
  });

  statusEl.textContent = `Filled: ${(response.result.filled as string[]).join(', ') || 'none'}. Review and submit manually.`;
}

listEl.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const prepareId = t.getAttribute('data-prepare');
  const copyId = t.getAttribute('data-copy');
  if (prepareId) {
    void prepareAndFill(prepareId).catch((err) => {
      statusEl.textContent = err instanceof Error ? err.message : 'Failed';
      statusEl.className = 'error';
    });
  }
  if (copyId) {
    void (async () => {
      const prepared = await api<{ payload: unknown }>(`/v1/vehicles/${copyId}/prepare-listing`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await navigator.clipboard.writeText(JSON.stringify(prepared.payload, null, 2));
      statusEl.textContent = 'Payload copied to clipboard';
    })().catch((err) => {
      statusEl.textContent = err instanceof Error ? err.message : 'Failed';
      statusEl.className = 'error';
    });
  }
});

searchBtn.addEventListener('click', () => void load());
qEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void load();
});

void load();
