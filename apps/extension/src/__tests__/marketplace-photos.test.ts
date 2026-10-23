import { describe, expect, it } from "vitest";
import {
  PHOTO_PROMPT_LABELS,
  elementLooksLikePhotoPrompt,
  scorePhotoInput,
} from "../marketplace-photos";

describe("marketplace photo selectors", () => {
  it("scores the hidden Marketplace image input without CSS classes", () => {
    const input = {
      accept: "image/*,heif,heic,video/*",
      multiple: true,
      disabled: false,
    } as HTMLInputElement;

    expect(scorePhotoInput(input)).toBeGreaterThanOrEqual(7);
    expect(PHOTO_PROMPT_LABELS).toEqual(
      expect.arrayContaining(["ajouter des photos", "add photos"]),
    );
  });

  it("recognizes FR and EN photo prompts from aria-label", () => {
    const french = {
      getAttribute: (name: string) =>
        name === "aria-label" ? "Ajouter des photos" : null,
      textContent: "",
    } as unknown as Element;
    const english = {
      getAttribute: (name: string) =>
        name === "aria-label" ? "Add photos" : null,
      textContent: "",
    } as unknown as Element;
    expect(elementLooksLikePhotoPrompt(french)).toBe(true);
    expect(elementLooksLikePhotoPrompt(english)).toBe(true);
  });
});
