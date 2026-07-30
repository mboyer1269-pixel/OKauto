import { prisma } from '@okauto/db';
import { createTokenSchema } from '@okauto/shared';
import { generateToken, hashToken } from '@okauto/shared/password';
import { handler, jsonOk, parseJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { audit, clientIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  const user = await requireUser(req);
  const tokens = await prisma.apiToken.findMany({
    where: { userId: user.id, revokedAt: null },
    select: { id: true, label: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return jsonOk(tokens);
});

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const input = await parseJson(req, createTokenSchema);
  const raw = generateToken();
  const tokenHash = await hashToken(raw);
  const token = await prisma.apiToken.create({
    data: { userId: user.id, label: input.label, tokenHash },
  });
  await audit({ actorId: user.id, action: 'token.create', targetType: 'apiToken', targetId: token.id, ip: clientIp(req) });
  // Raw token shown once — the extension stores it locally.
  return jsonOk({ id: token.id, label: token.label, token: raw }, { status: 201 });
});
