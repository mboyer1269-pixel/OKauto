import { describe, expect, it } from "vitest";
import { detectMarketplaceSession } from "../publication-tracking";

function fakeDocument(options: {
  login?: boolean;
  items?: number;
  bodyText?: string;
}) {
  const items = Array.from({ length: options.items ?? 0 }, (_, index) => ({
    href: `/marketplace/item/${index + 1}/`,
  }));
  return {
    querySelector: (selector: string) => {
      if (
        options.login &&
        /login|email|pass|password/.test(selector)
      ) {
        return { tagName: "FORM" };
      }
      if (selector.includes("/marketplace/item/") && items.length > 0) {
        return items[0];
      }
      return null;
    },
    querySelectorAll: (selector: string) => {
      if (selector.includes("/marketplace/item/")) return items;
      if (options.login && /button|a/.test(selector)) {
        return [
          {
            getAttribute: () => "Se connecter",
            textContent: "Se connecter",
          },
        ];
      }
      return [];
    },
    body: { innerText: options.bodyText ?? "" },
  };
}

describe("Marketplace session detection", () => {
  it("signals a logged-out Facebook page", () => {
    expect(
      detectMarketplaceSession(
        fakeDocument({
          login: true,
          bodyText: "Se connecter à Facebook",
        }),
      ),
    ).toBe("logged_out");
  });

  it("signals a connected selling page from listing links", () => {
    expect(
      detectMarketplaceSession(
        fakeDocument({
          items: 2,
          bodyText: "Vos annonces 2022 Honda Accord GMC Terrain",
        }),
      ),
    ).toBe("logged_in");
  });
});
