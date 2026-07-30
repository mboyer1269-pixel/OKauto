/**
 * Resilient Marketplace create-form adapters.
 * Selectors are intentionally broad and versioned — Facebook DOM changes frequently.
 * This module only fills fields; it never submits and never interacts with CAPTCHA.
 */

export type FillPayload = {
  title: string;
  price: number | null;
  description: string;
  mileage: number | null;
  year: number | null;
  make: string | null;
  model: string | null;
  exteriorColor: string | null;
};

export type FillResult = {
  filled: string[];
  missing: string[];
  warnings: string[];
};

function visible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  desc?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function findField(matchers: RegExp[]): HTMLInputElement | HTMLTextAreaElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
  ).filter(visible);

  for (const el of candidates) {
    const labelText = [
      el.getAttribute('aria-label'),
      el.getAttribute('placeholder'),
      el.getAttribute('name'),
      el.id,
      el.closest('label')?.textContent,
      document.querySelector(`label[for="${el.id}"]`)?.textContent,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (matchers.some((re) => re.test(labelText))) return el;
  }
  return null;
}

export function fillMarketplaceForm(payload: FillPayload): FillResult {
  const filled: string[] = [];
  const missing: string[] = [];
  const warnings: string[] = [
    'OKauto filled available fields only. Review every value and submit yourself. Never bypass CAPTCHA.',
  ];

  const map: Array<[string, RegExp[], string | null]> = [
    ['title', [/title|item name|what are you selling/i], payload.title],
    [
      'price',
      [/price|amount/i],
      payload.price != null ? String(Math.round(payload.price)) : null,
    ],
    ['description', [/description|describe|more details/i], payload.description],
    [
      'mileage',
      [/mileage|odometer|miles/i],
      payload.mileage != null ? String(payload.mileage) : null,
    ],
    ['year', [/^year$|model year/i], payload.year != null ? String(payload.year) : null],
    ['make', [/make|manufacturer/i], payload.make],
    ['model', [/^model$/i], payload.model],
    ['color', [/color|exterior/i], payload.exteriorColor],
  ];

  for (const [key, matchers, value] of map) {
    if (value == null || value === '') {
      missing.push(key);
      continue;
    }
    const el = findField(matchers);
    if (!el) {
      missing.push(key);
      continue;
    }
    setNativeValue(el, value);
    filled.push(key);
  }

  return { filled, missing, warnings };
}

export function isLikelyMarketplaceCreatePage(): boolean {
  const href = location.href.toLowerCase();
  return (
    href.includes('marketplace') &&
    (href.includes('create') || href.includes('composer') || href.includes('sell'))
  );
}
