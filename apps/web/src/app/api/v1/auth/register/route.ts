import { prisma } from "@lotpilot/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  audit,
  badRequest,
  conflict,
  handler,
  json,
  parseBody,
  tooManyRequests,
} from "@/server/api";
import { clientIp, rateLimit } from "@/server/ratelimit";
import { createSessionToken, sessionCookieHeader } from "@/server/session";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(200),
  phone: z.string().trim().max(30).optional(),
});

export const POST = handler(async (req) => {
  if (!rateLimit(`register:${clientIp(req)}`, 10, 15 * 60_000)) throw tooManyRequests();
  const body = await parseBody(req, schema);

  if (!/[a-zA-Z]/.test(body.password) || !/[0-9]/.test(body.password)) {
    throw badRequest("Password must contain at least one letter and one number");
  }

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) throw conflict("An account with this email already exists");

  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      phone: body.phone ?? null,
      passwordHash: await bcrypt.hash(body.password, 12),
    },
  });
  await audit(req, {
    userId: user.id,
    action: "user.register",
    entityType: "user",
    entityId: user.id,
  });

  const token = await createSessionToken({ userId: user.id, email: user.email });
  return json(
    { user: { id: user.id, name: user.name, email: user.email } },
    { status: 201, headers: { "set-cookie": sessionCookieHeader(token) } },
  );
});
