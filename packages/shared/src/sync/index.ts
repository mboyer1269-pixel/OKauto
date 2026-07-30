import type { SyncAdapter, SyncAdapterName } from './types';
import { genericAdapter } from './adapters/generic';
import { dealerJsonAdapter } from './adapters/dealer-json';
import { jsonLdAdapter } from './adapters/json-ld';

export * from './types';

const adapters: Record<SyncAdapterName, SyncAdapter> = {
  generic: genericAdapter,
  'dealer-json': dealerJsonAdapter,
  'json-ld': jsonLdAdapter,
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

  if (adapterName === 'json-ld' || contentType?.includes('text/html')) {
    return jsonLdAdapter.parse(body);
  }

  return adapter.parse(body, contentType);
}
