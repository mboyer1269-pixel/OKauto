import { describe, expect, it } from "vitest";
import {
  allowedTransitions,
  assertTransition,
  canTransition,
  isTerminalListingStatus,
} from "../src/listing-state-machine.js";

describe("listing state machine", () => {
  it("happy path: DRAFT -> READY -> QUEUED -> IN_PROGRESS -> LIVE -> NEEDS_REMOVAL -> REMOVED", () => {
    const path = ["READY", "QUEUED", "IN_PROGRESS", "LIVE", "NEEDS_REMOVAL", "REMOVED"] as const;
    let from = "DRAFT" as const;
    for (const to of path) {
      expect(canTransition(from, to)).toBe(true);
      from = to as typeof from;
    }
    expect(isTerminalListingStatus("REMOVED")).toBe(true);
  });

  it("failure path: IN_PROGRESS -> ATTENTION -> QUEUED (recovery)", () => {
    expect(canTransition("IN_PROGRESS", "ATTENTION")).toBe(true);
    expect(canTransition("ATTENTION", "QUEUED")).toBe(true);
    expect(canTransition("LIVE", "ATTENTION")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("DRAFT", "LIVE")).toBe(false);
    expect(canTransition("REMOVED", "QUEUED")).toBe(false);
    expect(canTransition("ENDED", "DRAFT")).toBe(false);
    expect(() => assertTransition("DRAFT", "LIVE")).toThrowError(/Invalid listing transition/);
  });

  it("terminal states have no outgoing transitions", () => {
    expect(allowedTransitions("REMOVED")).toHaveLength(0);
    expect(allowedTransitions("ENDED")).toHaveLength(0);
  });
});
