/** Backend API client for the extension, using the stored device token. */
import type { MarketplaceAdapter, MarketplaceVehicleFields } from '@okauto/shared';
import { getConfig } from './storage.js';

export interface ExtVehicle {
  id: string;
  title: string;
  priceCents: number | null;
  mileage: number | null;
  vin: string | null;
  stockNumber: string | null;
  _count: { photos: number; listings: number };
}

export interface PrefillPayload {
  vehicle: { id: string; title: string };
  fields: MarketplaceVehicleFields;
  photoUrls: string[];
  adapter: MarketplaceAdapter;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const config = await getConfig();
  if (!config) throw new Error('Not connected. Open extension options to pair.');
  const res = await fetch(`${config.apiUrl}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: { message: string } };
  if (!res.ok || body.error) {
    throw new Error(body.error?.message ?? `Request failed (${res.status})`);
  }
  return body.data as T;
}

export async function testConnection(apiUrl: string, token: string): Promise<{ user: { name: string } }> {
  const res = await fetch(`${apiUrl}/api/v1/extension/config`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: { user: { name: string } };
    error?: { message: string };
  };
  if (!res.ok || body.error) throw new Error(body.error?.message ?? 'Connection failed');
  return body.data as { user: { name: string } };
}

export async function listVehicles(q?: string): Promise<ExtVehicle[]> {
  const config = await getConfig();
  if (!config) throw new Error('Not connected');
  return request<ExtVehicle[]>(
    `/extension/orgs/${config.organizationId}/vehicles${q ? `?q=${encodeURIComponent(q)}` : ''}`,
  );
}

export async function getPrefill(vehicleId: string): Promise<PrefillPayload> {
  return request<PrefillPayload>(`/extension/vehicles/${vehicleId}/prefill`);
}

export async function recordPrefill(
  vehicleId: string,
  description: string,
): Promise<{ id: string; status: string }> {
  return request<{ id: string; status: string }>(`/extension/listings`, {
    method: 'POST',
    body: JSON.stringify({ vehicleId, description, descriptionProvider: 'okauto' }),
  });
}

export async function setListingStatus(
  listingId: string,
  status: string,
  externalUrl?: string,
): Promise<void> {
  await request(`/listings/${listingId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status, externalUrl }),
  });
}
