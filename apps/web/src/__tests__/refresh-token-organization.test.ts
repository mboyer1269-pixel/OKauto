import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@okauto/database";
import {
  createRefreshToken,
  validateRefreshToken,
  verifyAccessToken,
} from "@/lib/auth";
import { POST as refreshHandler } from "@/app/api/v1/auth/refresh/route";

describe("organization-bound refresh sessions", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `refresh-session-${suffix}@example.com`;
  let userId = "";
  let firstOrganizationId = "";
  let selectedOrganizationId = "";

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email, name: "Test Session", passwordHash: "not-used" },
    });
    userId = user.id;

    const [firstOrganization, selectedOrganization] = await Promise.all([
      prisma.organization.create({
        data: { name: "First Test Organization", slug: `first-${suffix}` },
      }),
      prisma.organization.create({
        data: {
          name: "Selected Test Organization",
          slug: `selected-${suffix}`,
        },
      }),
    ]);
    firstOrganizationId = firstOrganization.id;
    selectedOrganizationId = selectedOrganization.id;

    await prisma.organizationMember.createMany({
      data: [
        {
          organizationId: firstOrganizationId,
          userId,
          role: "SALESPERSON",
        },
        {
          organizationId: selectedOrganizationId,
          userId,
          role: "MANAGER",
        },
      ],
    });
  });

  afterAll(async () => {
    if (userId) {
      await prisma.refreshToken.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (firstOrganizationId || selectedOrganizationId) {
      await prisma.organization.deleteMany({
        where: { id: { in: [firstOrganizationId, selectedOrganizationId] } },
      });
    }
  });

  it("keeps the selected organization after an access-token refresh", async () => {
    const refreshToken = await createRefreshToken(
      userId,
      selectedOrganizationId,
    );
    const storedRecord = await validateRefreshToken(refreshToken);
    expect(storedRecord?.organizationId).toBe(selectedOrganizationId);

    const request = new Request("http://localhost/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const response = await refreshHandler(request as never);
    const data = await response.json();
    const payload = await verifyAccessToken(data.accessToken);

    expect(response.status).toBe(200);
    expect(payload?.orgId).toBe(selectedOrganizationId);
    expect(payload?.role).toBe("MANAGER");
  });
});
