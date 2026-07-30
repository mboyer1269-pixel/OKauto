import { NextRequest } from 'next/server';
import { refreshSchema } from '@okauto/shared';
import { revokeRefreshToken } from '@/lib/auth';
import { jsonResponse, handleApiError, parseBody } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody<unknown>(request);
    const data = refreshSchema.parse(body);
    await revokeRefreshToken(data.refreshToken);

    const response = jsonResponse({ success: true });
    response.cookies.delete('access_token');
    return response;
  } catch (err) {
    return handleApiError(err);
  }
}
