import { describe, expect, it } from "vitest";
import {
  PHOTO_PROMPT_LABELS,
  elementLooksLikePhotoPrompt,
  isPhotoFileInput,
  scorePhotoInput,
} from "../marketplace-photos";

describe("marketplace photo selectors", () => {
  it("scores the hidden Marketplace image input without CSS classes", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,heif,heic,video/*";
    input.style.display = "none";

    expect(isPhotoFileInput(input)).toBe(true);
    expect(scorePhotoInput(input)).toBeGreaterThanOrEqual(7);
    expect(PHOTO_PROMPT_LABELS).toEqual(
      expect.arrayContaining(["ajouter des photos", "add photos"]),
    );
  });

  it("recognizes FR and EN photo prompts from aria-label", () => {
    const button = document.createElement("button");
    button.setAttribute("aria-label", "Ajouter des photos");
    expect(elementLooksLikePhotoPrompt(button)).toBe(true);
    button.setAttribute("aria-label", "Add photos");
    button.textContent = "";
    expect(elementLooksLikePhotoPrompt(button)).toBe(true);
  });
});
