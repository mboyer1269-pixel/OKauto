import { NextRequest } from 'next/server';
import { registerSchema, loginSchema, refreshSchema } from '@okauto/shared';
import { prisma, Role } from '@okauto/database';
import {
  hashPassword,
  signAccessToken,
  createRefreshToken,
  createAuditLog,
} from '@/lib/auth';
import { slugify } from '@/lib/utils';
import { jsonResponse, errorResponse, handleApiError, parseBody } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody<unknown>(request);
    const data = registerSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return errorResponse('Email already registered', 409);
    }

    const passwordHash = await hashPassword(data.password);
    const orgName = data.organizationName ?? `${data.name}'s Dealership`;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: data.email, passwordHash, name: data.name },
      });

      const org = await tx.organization.create({
        data: {
          name: orgName,
          slug: slugify(orgName) + '-' + user.id.slice(-6),
        },
      });

      await tx.organizationMember.create({
        data: { organizationId: org.id, userId: user.id, role: Role.OWNER },
      });

      return { user, org };
    });

    const accessToken = await signAccessToken({
      sub: result.user.id,
      email: result.user.email,
      orgId: result.org.id,
      role: Role.OWNER,
    });
    const refreshToken = await createRefreshToken(result.user.id);

    await createAuditLog({
      organizationId: result.org.id,
      userId: result.user.id,
      action: 'CREATE',
      entityType: 'user',
      entityId: result.user.id,
      request,
    });

    const response = jsonResponse({
      user: { id: result.user.id, email: result.user.email, name: result.user.name },
      organization: { id: result.org.id, name: result.org.name, slug: result.org.slug },
      accessToken,
      refreshToken,
    });

    response.cookies.set('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60,
      path: '/',
    });

    return response;
  } catch (err) {
    return handleApiError(err);
  }
}
