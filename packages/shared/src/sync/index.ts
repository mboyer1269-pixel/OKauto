import type { SyncAdapter, SyncAdapterName } from './types';
import { genericAdapter } from './adapters/generic';
import { dealerJsonAdapter } from './adapters/dealer-json';
import { jsonLdAdapter } from './adapters/json-ld';
import { d2cAdapter } from './adapters/d2c';
export { extractD2cDetailPhotos } from './adapters/d2c';

export * from './types';

const adapters: Record<SyncAdapterName, SyncAdapter> = {
  generic: genericAdapter,
  'dealer-json': dealerJsonAdapter,
  'json-ld': jsonLdAdapter,
  d2c: d2cAdapter,
};

export function getSyncAdapter(name: string): SyncAdapter {
  return adapters[name as SyncAdapterName] ?? genericAdapter;
}

export function parseSyncFeed(
  adapterName: string,
  body: string,
  contentType?: string | null
) {
  const adapter = getSyncAdapter(adapterName);

  if (adapterName === 'd2c') {
    return d2cAdapter.parse(body);
  }

  if (adapterName === 'json-ld' || contentType?.includes('text/html')) {
    return jsonLdAdapter.parse(body);
  }

  return adapter.parse(body, contentType);
}
