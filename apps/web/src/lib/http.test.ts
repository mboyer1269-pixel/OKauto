import { describe, expect, it } from "vitest";
import { jsonError } from "./http";

describe("http helpers", () => {
  it("returns the standard API error envelope", async () => {
    const response = jsonError("INVALID_INPUT", "Invalid input.", 422);
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_INPUT",
        message: "Invalid input."
      }
    });
  });
});
