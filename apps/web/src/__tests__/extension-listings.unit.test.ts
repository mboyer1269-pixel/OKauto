import { describe, expect, it } from "vitest";
import { marketplaceUrlFromMetadata } from "@/lib/extension-listings";

describe("marketplaceUrlFromMetadata", () => {
  it("canonicalizes a published Marketplace item URL and ID", () => {
    expect(
      marketplaceUrlFromMetadata({
        externalUrl: "https://www.facebook.com/marketplace/item/424242/?ref=share",
      }),
    ).toEqual({
      externalId: "424242",
      externalUrl: "https://www.facebook.com/marketplace/item/424242/",
    });
  });

  it("accepts an item ID when the URL is missing", () => {
    expect(marketplaceUrlFromMetadata({ externalId: "424242" })).toEqual({
      externalId: "424242",
      externalUrl: "https://www.facebook.com/marketplace/item/424242/",
    });
  });

  it("rejects a create URL", () => {
    expect(
      marketplaceUrlFromMetadata({
        externalUrl: "https://www.facebook.com/marketplace/create/vehicle",
      }),
    ).toBeNull();
  });
});
