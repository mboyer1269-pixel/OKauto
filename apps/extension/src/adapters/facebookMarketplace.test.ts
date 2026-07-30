import { describe, expect, it } from "vitest";
import { detectBlockingUI, fillMarketplaceForm } from "./facebookMarketplace";

describe("facebook marketplace adapter", () => {
  it("fills labeled inputs", () => {
    document.body.innerHTML = `
      <label>Title<input id="t" /></label>
      <label>Price<input id="p" /></label>
      <label>Description<textarea id="d"></textarea></label>
    `;
    const result = fillMarketplaceForm({
      title: "2021 Honda Accord",
      price: 23999,
      description: "Clean title",
    });
    expect(result.captchaDetected).toBe(false);
    expect(result.filled).toEqual(expect.arrayContaining(["title", "price", "description"]));
    expect((document.getElementById("t") as HTMLInputElement).value).toBe("2021 Honda Accord");
  });

  it("pauses on captcha", () => {
    document.body.innerHTML = `<div>Confirm you're human</div><iframe src="https://example.com/captcha"></iframe>`;
    const blocking = detectBlockingUI();
    expect(blocking.captchaDetected).toBe(true);
  });
});
