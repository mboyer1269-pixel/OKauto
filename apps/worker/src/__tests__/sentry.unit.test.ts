import { describe, expect, it } from "vitest";
import { sentryRelease } from "../sentry.js";

describe("sentryRelease", () => {
  it("prefers APP_VERSION over GIT_SHA", () => {
    expect(
      sentryRelease({
        APP_VERSION: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        GIT_SHA: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      }),
    ).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("is undefined when neither is set", () => {
    expect(sentryRelease({})).toBeUndefined();
  });
});
