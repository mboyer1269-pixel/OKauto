/**
 * Resilient selector/adapter registry for the Marketplace composer.
 *
 * Improvement over brittle single-selector scraping: each logical field maps to an
 * ORDERED list of selector strategies (aria-label, data-testid, label text, placeholder,
 * name). The content script tries them in order and reports which strategy matched, so we
 * get self-healing behavior and observability into UI drift. Selectors are DOM structure
 * hints only — no proprietary markup is copied, and nothing is auto-submitted.
 */

export type FieldStrategyKind =
  | 'aria-label'
  | 'label-text'
  | 'placeholder'
  | 'name'
  | 'data-testid'
  | 'role';

export interface FieldStrategy {
  kind: FieldStrategyKind;
  /** Value to match (case-insensitive contains for text-based kinds). */
  value: string;
}

export interface FieldAdapter {
  field: string;
  /** Input type hint to help the content script decide how to set the value. */
  control: 'text' | 'textarea' | 'select' | 'combobox' | 'file';
  strategies: FieldStrategy[];
  required?: boolean;
}

export interface MarketplaceAdapter {
  channel: 'FACEBOOK_MARKETPLACE';
  /** Adapter version so we can ship updates without extension re-review churn. */
  version: string;
  /** URL patterns where this adapter is valid. */
  urlPatterns: string[];
  fields: FieldAdapter[];
}

/**
 * Default adapter. Uses accessibility attributes first (most stable), then falls back to
 * label text and placeholders. Extend/override at runtime via the API for fast recovery
 * when the host UI changes.
 */
export const FACEBOOK_MARKETPLACE_ADAPTER: MarketplaceAdapter = {
  channel: 'FACEBOOK_MARKETPLACE',
  version: '2025.1.0',
  urlPatterns: ['*://*.facebook.com/marketplace/create/vehicle*'],
  fields: [
    {
      field: 'year',
      control: 'combobox',
      required: true,
      strategies: [
        { kind: 'aria-label', value: 'Year' },
        { kind: 'label-text', value: 'Year' },
      ],
    },
    {
      field: 'make',
      control: 'combobox',
      required: true,
      strategies: [
        { kind: 'aria-label', value: 'Make' },
        { kind: 'label-text', value: 'Make' },
      ],
    },
    {
      field: 'model',
      control: 'text',
      required: true,
      strategies: [
        { kind: 'aria-label', value: 'Model' },
        { kind: 'label-text', value: 'Model' },
      ],
    },
    {
      field: 'mileage',
      control: 'text',
      strategies: [
        { kind: 'aria-label', value: 'Mileage' },
        { kind: 'label-text', value: 'Mileage' },
      ],
    },
    {
      field: 'price',
      control: 'text',
      required: true,
      strategies: [
        { kind: 'aria-label', value: 'Price' },
        { kind: 'label-text', value: 'Price' },
      ],
    },
    {
      field: 'bodyStyle',
      control: 'combobox',
      strategies: [
        { kind: 'aria-label', value: 'Body style' },
        { kind: 'label-text', value: 'Body style' },
      ],
    },
    {
      field: 'exteriorColor',
      control: 'combobox',
      strategies: [
        { kind: 'aria-label', value: 'Exterior color' },
        { kind: 'label-text', value: 'Exterior color' },
      ],
    },
    {
      field: 'interiorColor',
      control: 'combobox',
      strategies: [
        { kind: 'aria-label', value: 'Interior color' },
        { kind: 'label-text', value: 'Interior color' },
      ],
    },
    {
      field: 'fuelType',
      control: 'combobox',
      strategies: [
        { kind: 'aria-label', value: 'Fuel type' },
        { kind: 'label-text', value: 'Fuel type' },
      ],
    },
    {
      field: 'transmission',
      control: 'combobox',
      strategies: [
        { kind: 'aria-label', value: 'Transmission' },
        { kind: 'label-text', value: 'Transmission' },
      ],
    },
    {
      field: 'description',
      control: 'textarea',
      required: true,
      strategies: [
        { kind: 'aria-label', value: 'Description' },
        { kind: 'label-text', value: 'Description' },
      ],
    },
  ],
};

export function getAdapterForUrl(
  url: string,
  adapters: MarketplaceAdapter[] = [FACEBOOK_MARKETPLACE_ADAPTER],
): MarketplaceAdapter | null {
  for (const adapter of adapters) {
    for (const pattern of adapter.urlPatterns) {
      if (matchUrlPattern(pattern, url)) return adapter;
    }
  }
  return null;
}

/** Chrome-style match pattern matcher (subset: scheme/host wildcards + path prefix). */
export function matchUrlPattern(pattern: string, url: string): boolean {
  const regex = new RegExp(
    '^' +
      pattern
        .replace(/[.+?^${}()|[\]\\*]/g, '\\$&')
        .replace(/\\\*/g, '.*') +
      '$',
  );
  return regex.test(url);
}
