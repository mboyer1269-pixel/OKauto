import { describe, expect, it } from "vitest";
import { detectMarketplaceSession } from "../publication-tracking";

describe("Marketplace session detection", () => {
  it("signals a logged-out Facebook page", () => {
    document.body.innerHTML = `
      <form action="/login">
        <input name="email" />
        <input name="pass" type="password" />
        <button>Se connecter</button>
      </form>
    `;
    expect(detectMarketplaceSession(document)).toBe("logged_out");
  });

  it("signals a connected selling page from listing links", () => {
    document.body.innerHTML = `
      <a href="/marketplace/item/123456789/">2022 Honda Accord</a>
      <a href="/marketplace/item/987654321/">GMC Terrain</a>
    `;
    expect(detectMarketplaceSession(document)).toBe("logged_in");
  });
});
