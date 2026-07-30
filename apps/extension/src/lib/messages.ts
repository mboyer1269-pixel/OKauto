import type { PrefillPayload } from './api.js';

export interface PendingPrefill {
  listingId: string;
  payload: PrefillPayload;
  createdAt: number;
}

export const PENDING_KEY = 'okauto.pending';

export type BgMessage =
  | { type: 'SET_STATUS'; listingId: string; status: string; externalUrl?: string }
  | { type: 'PING' };

export interface BgResponse {
  ok: boolean;
  error?: string;
}
