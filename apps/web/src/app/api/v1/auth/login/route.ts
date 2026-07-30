import { prisma } from "@lotpilot/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { audit, handler, json, parseBody, tooManyRequests, unauthorized } from "@/server/api";
import { clientIp, rateLimit } from "@/server/ratelimit";
import { createSessionToken, sessionCookieHeader } from "@/server/session";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export const POST = handler(async (req) => {
  if (!rateLimit(`login:${clientIp(req)}`, 20, 15 * 60_000)) throw tooManyRequests();
  const body = await parseBody(req, schema);
  if (!rateLimit(`login:${body.email}`, 10, 15 * 60_000)) throw tooManyRequests();

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  // Constant-shape comparison even when the user does not exist.
  const hash = user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
  const valid = await bcrypt.compare(body.password, hash);
  if (!user || !valid) throw unauthorized("Invalid email or password");

  await audit(req, {
    userId: user.id,
    action: "user.login",
    entityType: "user",
    entityId: user.id,
  });
  const token = await createSessionToken({ userId: user.id, email: user.email });
  return json(
    { user: { id: user.id, name: user.name, email: user.email, platformRole: user.platformRole } },
    { headers: { "set-cookie": sessionCookieHeader(token) } },
  );
});
