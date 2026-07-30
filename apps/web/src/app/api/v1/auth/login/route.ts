import { prisma } from '@okauto/db';
import { loginSchema } from '@okauto/shared';
import { verifyPassword } from '@okauto/shared/password';
import { handler, httpErrors, jsonOk, parseJson } from '@/lib/http';
import { createSessionToken, setSessionCookie } from '@/lib/auth';
import { audit, clientIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handler(async (req) => {
  const input = await parseJson(req, loginSchema);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const ok = user ? await verifyPassword(input.password, user.passwordHash) : false;
  if (!user || !ok) {
    // Same message either way to avoid user enumeration.
    throw httpErrors.unauthorized('Invalid email or password');
  }

  const token = await createSessionToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
  });
  await setSessionCookie(token);
  await audit({ actorId: user.id, action: 'auth.login', ip: clientIp(req) });

  return jsonOk({ user: { id: user.id, email: user.email, name: user.name } });
});
