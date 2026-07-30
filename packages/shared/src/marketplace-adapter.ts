/**
 * Types for the extension's resilient Marketplace form adapter.
 * Strategies are data (config-over-code) so selectors can be updated without
 * redeploying logic, and every fill reports which strategy matched.
 */

export type SelectorStrategy =
  | { kind: "ariaRole"; role: string; name: string | RegExp }
  | { kind: "label"; text: string | RegExp }
  | { kind: "placeholder"; text: string | RegExp }
  | { kind: "css"; selector: string }
  | { kind: "testId"; id: string };

export type FillableField =
  | "title"
  | "price"
  | "description"
  | "year"
  | "make"
  | "model"
  | "mileage"
  | "bodyStyle"
  | "fuelType"
  | "transmission"
  | "condition"
  | "photos";

export interface FieldFillResult {
  field: FillableField;
  ok: boolean;
  strategyIndex: number | null;
  strategyKind: string | null;
  attempts: number;
  error?: string;
}

export interface AssistReport {
  startedAt: string;
  finishedAt: string;
  fieldResults: FieldFillResult[];
  photosStaged: number;
  aborted: boolean;
  abortReason?: string;
}

/** Messages between popup/background/content scripts. */
export type ExtensionMessage =
  | { type: "GET_STATUS" }
  | { type: "START_ASSIST"; listingId: string }
  | { type: "ASSIST_PROGRESS"; listingId: string; report: AssistReport }
  | { type: "ASSIST_DONE"; listingId: string; report: AssistReport; externalUrl?: string }
  | { type: "FETCH_PHOTO"; url: string }
  | { type: "FETCH_PHOTO_RESULT"; url: string; ok: boolean; blobBase64?: string; contentType?: string; error?: string };

export const MARKETPLACE_CREATE_URL = "https://www.facebook.com/marketplace/create/vehicle";
export const MARKETPLACE_YOU_URL = "https://www.facebook.com/marketplace/you/selling";
