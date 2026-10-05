import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST as registerHandler } from "@/app/api/v1/auth/register/route";
import {
  isPublicSignupEnabled,
  PUBLIC_SIGNUP_CLOSED_MESSAGE,
} from "@/lib/signup";
import { prisma } from "@okauto/database";

function makeRequest(body: unknown, extraHeaders?: Record<string, string>) {
  return new Request("http://localhost/api/v1/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

const validSignup = {
  name: "Patrice Gagnon",
  email: `signup-open-${Date.now()}@example.com`,
  password: "SecurePass123!",
  organizationName: "Concession Test Sécurité",
};

describe("public signup access", () => {
  const previous = process.env.ALLOW_PUBLIC_SIGNUP;

  afterEach(() => {
    if (previous === undefined) delete process.env.ALLOW_PUBLIC_SIGNUP;
    else process.env.ALLOW_PUBLIC_SIGNUP = previous;
  });

  it("is disabled unless ALLOW_PUBLIC_SIGNUP is true", () => {
    delete process.env.ALLOW_PUBLIC_SIGNUP;
    expect(isPublicSignupEnabled()).toBe(false);

    process.env.ALLOW_PUBLIC_SIGNUP = "false";
    expect(isPublicSignupEnabled()).toBe(false);

    process.env.ALLOW_PUBLIC_SIGNUP = "true";
    expect(isPublicSignupEnabled()).toBe(true);
  });

  it("returns 403 with a French message when public signup is closed", async () => {
    process.env.ALLOW_PUBLIC_SIGNUP = "false";
    const res = await registerHandler(makeRequest(validSignup) as never);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe(PUBLIC_SIGNUP_CLOSED_MESSAGE);
    expect(data.accessToken).toBeUndefined();
  });

  it("does not reveal whether an email exists when signup is closed", async () => {
    process.env.ALLOW_PUBLIC_SIGNUP = "false";
    const res = await registerHandler(
      makeRequest({
        ...validSignup,
        email: "owner@demo.okauto.local",
      }) as never,
    );
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe(PUBLIC_SIGNUP_CLOSED_MESSAGE);
  });
});

describe("public signup when enabled", () => {
  const previous = process.env.ALLOW_PUBLIC_SIGNUP;
  const createdEmails: string[] = [];

  beforeEach(() => {
    process.env.ALLOW_PUBLIC_SIGNUP = "true";
  });

  afterEach(async () => {
    if (previous === undefined) delete process.env.ALLOW_PUBLIC_SIGNUP;
    else process.env.ALLOW_PUBLIC_SIGNUP = previous;

    if (createdEmails.length === 0) return;
    const users = await prisma.user.findMany({
      where: { email: { in: createdEmails } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    if (userIds.length === 0) return;

    const memberships = await prisma.organizationMember.findMany({
      where: { userId: { in: userIds } },
      select: { organizationId: true },
    });
    const organizationIds = [
      ...new Set(memberships.map((membership) => membership.organizationId)),
    ];

    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (organizationIds.length > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
    }
  });

  it("creates an organization when ALLOW_PUBLIC_SIGNUP=true", async () => {
    const email = `signup-allowed-${Date.now()}@example.com`;
    createdEmails.push(email);

    const res = await registerHandler(
      makeRequest({ ...validSignup, email }) as never,
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.user.email).toBe(email);
    expect(data.organization.name).toBe(validSignup.organizationName);
    expect(data.accessToken).toBeTruthy();
  });
});
