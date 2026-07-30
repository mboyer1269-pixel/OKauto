import { generateMarketplaceTitle } from '@okauto/shared';

export interface VehiclePayload {
  id: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  mileage?: number;
  price?: number;
  description?: string;
  exteriorColor?: string;
  photos?: string[];
}

/**
 * Versioned selector config for Facebook Marketplace create form.
 * Update selectors here when Facebook changes their DOM — no code deploy needed
 * beyond extension update.
 */
const SELECTORS = {
  v1: {
    title: [
      'input[aria-label*="itle"]',
      'input[placeholder*="itle"]',
      'label:has(span:contains("Title")) + input',
      '[data-testid="marketplace-composer-title-input"]',
    ],
    price: [
      'input[aria-label*="rice"]',
      'input[placeholder*="rice"]',
      '[data-testid="marketplace-composer-price-input"]',
    ],
    description: [
      'textarea[aria-label*="escription"]',
      'textarea[placeholder*="escription"]',
      '[data-testid="marketplace-composer-description-input"]',
    ],
  },
};

function findElement(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    try {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) return el;
    } catch {
      // Invalid selector, skip
    }
  }
  return null;
}

function setInputValue(el: HTMLElement, value: string) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    nativeInputValueSetter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function fillForm(vehicle: VehiclePayload): { filled: string[]; errors: string[] } {
  const filled: string[] = [];
  const errors: string[] = [];
  const selectors = SELECTORS.v1;

  const title = generateMarketplaceTitle({
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    mileage: vehicle.mileage,
  });

  const titleEl = findElement(selectors.title);
  if (titleEl) {
    setInputValue(titleEl, title);
    filled.push('title');
  } else {
    errors.push('title field not found');
  }

  if (vehicle.price) {
    const priceEl = findElement(selectors.price);
    if (priceEl) {
      setInputValue(priceEl, String(Math.round(vehicle.price)));
      filled.push('price');
    } else {
      errors.push('price field not found');
    }
  }

  if (vehicle.description) {
    const descEl = findElement(selectors.description);
    if (descEl) {
      setInputValue(descEl, vehicle.description);
      filled.push('description');
    } else {
      errors.push('description field not found');
    }
  }

  return { filled, errors };
}

function showAssistBanner(vehicle: VehiclePayload, result: { filled: string[]; errors: string[] }) {
  const existing = document.getElementById('okauto-assist-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'okauto-assist-banner';
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 999999;
    background: #1e40af; color: white; padding: 12px 20px;
    font-family: system-ui, sans-serif; font-size: 14px;
    display: flex; align-items: center; justify-content: space-between;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  `;

  const statusText =
    result.errors.length > 0
      ? `Partial fill (${result.filled.join(', ')}). Some fields need manual entry.`
      : `Pre-filled: ${result.filled.join(', ')}. Review and click Publish when ready.`;

  banner.innerHTML = `
    <div>
      <strong>OKauto Assist</strong> — ${vehicle.year} ${vehicle.make} ${vehicle.model}
      <div style="font-size:12px;opacity:0.9;margin-top:2px">${statusText}</div>
    </div>
    <div style="display:flex;gap:8px">
      <button id="okauto-confirm-listing" style="background:#22c55e;color:white;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-weight:600">
        I Published This
      </button>
      <button id="okauto-dismiss-banner" style="background:transparent;color:white;border:1px solid white;padding:6px 12px;border-radius:6px;cursor:pointer">
        Dismiss
      </button>
    </div>
  `;

  document.body.prepend(banner);
  document.body.style.marginTop = '60px';

  document.getElementById('okauto-dismiss-banner')?.addEventListener('click', () => {
    banner.remove();
    document.body.style.marginTop = '';
  });

  document.getElementById('okauto-confirm-listing')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'LISTING_CONFIRMED',
      vehicleId: vehicle.id,
      externalUrl: window.location.href,
    });
    banner.remove();
    document.body.style.marginTop = '';
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'FILL_MARKETPLACE_FORM') {
    const vehicle = message.vehicle as VehiclePayload;
    const result = fillForm(vehicle);
    showAssistBanner(vehicle, result);
    sendResponse({ success: true, ...result });
    return true;
  }
  return false;
});

// Check for pending vehicle on page load
chrome.storage.local.get(['pendingVehicle'], (result) => {
  if (result.pendingVehicle && window.location.href.includes('marketplace')) {
    const vehicle = result.pendingVehicle as VehiclePayload;
    chrome.storage.local.remove(['pendingVehicle']);
    setTimeout(() => {
      const fillResult = fillForm(vehicle);
      showAssistBanner(vehicle, fillResult);
    }, 2000);
  }
});
