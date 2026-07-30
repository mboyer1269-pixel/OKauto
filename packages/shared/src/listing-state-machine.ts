import { TERMINAL_LISTING_STATUSES, type ListingStatus } from "./enums.js";

/**
 * Listing lifecycle state machine. The single source of truth for valid transitions;
 * enforced server-side and mirrored in the dashboard/extension UX.
 */
export const LISTING_TRANSITIONS: Readonly<Record<ListingStatus, readonly ListingStatus[]>> = {
  DRAFT: ["READY", "QUEUED", "ENDED"],
  READY: ["QUEUED", "DRAFT", "ENDED"],
  QUEUED: ["ASSIGNED", "IN_PROGRESS", "DRAFT", "ENDED"],
  ASSIGNED: ["IN_PROGRESS", "QUEUED", "DRAFT", "ENDED"],
  IN_PROGRESS: ["LIVE", "ATTENTION", "QUEUED", "ENDED"],
  LIVE: ["NEEDS_REMOVAL", "ATTENTION", "REMOVED", "ENDED"],
  ATTENTION: ["QUEUED", "IN_PROGRESS", "DRAFT", "ENDED"],
  NEEDS_REMOVAL: ["REMOVED", "ATTENTION", "LIVE"],
  REMOVED: [],
  ENDED: [],
};

export const RECOVERABLE_FAILURE_STATES: readonly ListingStatus[] = ["ATTENTION"];

export function isTerminalListingStatus(status: ListingStatus): boolean {
  return (TERMINAL_LISTING_STATUSES as readonly string[]).includes(status);
}

export function canTransition(from: ListingStatus, to: ListingStatus): boolean {
  return LISTING_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ListingStatus, to: ListingStatus): void {
  if (!canTransition(from, to)) {
    const err = new Error(`Invalid listing transition: ${from} -> ${to}`);
    (err as { code?: string }).code = "INVALID_TRANSITION";
    throw err;
  }
}

export function allowedTransitions(from: ListingStatus): readonly ListingStatus[] {
  return LISTING_TRANSITIONS[from];
}
