import { NextRequest } from 'next/server';
import { refreshSchema } from '@okauto/shared';
import { prisma } from '@okauto/database';
import { signAccessToken, validateRefreshToken } from '@/lib/auth';
import { jsonResponse, errorResponse, handleApiError, parseBody } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody<unknown>(request);
    const data = refreshSchema.parse(body);

    const record = await validateRefreshToken(data.refreshToken);
    if (!record) {
      return errorResponse('Invalid or expired refresh token', 401);
    }

    const membership = record.user.memberships[0];
    if (!membership) {
      return errorResponse('No organization membership', 403);
    }

    const accessToken = await signAccessToken({
      sub: record.user.id,
      email: record.user.email,
      orgId: membership.organizationId,
      role: membership.role,
    });

    const response = jsonResponse({ accessToken });
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
