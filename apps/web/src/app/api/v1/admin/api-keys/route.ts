import { prisma } from '@okauto/database';
import { createApiKeySchema } from '@okauto/shared';
import { withAuth, jsonResponse, parseBody } from '@/lib/api';
import { generateApiKey, hashToken } from '@/lib/auth';

export const GET = withAuth(async (_request, { auth }) => {
  const keys = await prisma.apiKey.findMany({
    where: { organizationId: auth.orgId, userId: auth.sub },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      lastUsedAt: true,
      expiresAt: true,
      isActive: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return jsonResponse(keys);
});

export const POST = withAuth(async (request, { auth }) => {
  const body = await parseBody<unknown>(request);
  const data = createApiKeySchema.parse(body);

  const rawKey = generateApiKey();
  const keyHash = hashToken(rawKey);

  const apiKey = await prisma.apiKey.create({
    data: {
      organizationId: auth.orgId,
      userId: auth.sub,
      name: data.name,
      keyHash,
      keyPrefix: rawKey.slice(0, 12),
    },
  });

  return jsonResponse({
    id: apiKey.id,
    name: apiKey.name,
    key: rawKey,
    keyPrefix: apiKey.keyPrefix,
    message: 'Save this key now. It will not be shown again.',
  }, 201);
});
