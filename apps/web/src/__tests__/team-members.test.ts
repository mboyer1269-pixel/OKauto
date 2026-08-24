import { describe, expect, it } from "vitest";
import { getTeamAccessLabel, getTeamMemberTitle } from "@/lib/team-members";

describe("team member presentation", () => {
  it("shows Michael Boyer as a sales representative without hiding his owner access", () => {
    const michael = { name: "Michael Boyer", email: "owner@demo.okauto.local" };

    expect(getTeamMemberTitle("OWNER", michael)).toBe(
      "Représentant aux ventes",
    );
    expect(getTeamAccessLabel("OWNER")).toBe("Administrateur principal");
  });

  it("uses the regular role label for other members", () => {
    const member = { name: "Marie Tremblay", email: "marie@example.com" };

    expect(getTeamMemberTitle("SALESPERSON", member)).toBe(
      "Représentant aux ventes",
    );
    expect(getTeamMemberTitle("MANAGER", member)).toBe("Direction des ventes");
  });
});
