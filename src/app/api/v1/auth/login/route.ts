import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { checkLoginRateLimit, login, SESSION_COOKIE } from "@/lib/auth";
import { assertMutationOrigin, errorResponse, json, requestId } from "@/lib/http";

const inputSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(8).max(200),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const id = requestId(request);
  try {
    assertMutationOrigin(request);
    const input = inputSchema.parse(await request.json());
    const remote = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    await checkLoginRateLimit(createHash("sha256").update(`${remote}:${input.email.toLowerCase()}`).digest("hex"));
    const result = await login(input.email, input.password);
    const response = json({ user: result.context.user, organization: result.context.organization, role: result.context.role }, {}, id);
    response.cookies.set(SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    return errorResponse(error, id);
  }
}
