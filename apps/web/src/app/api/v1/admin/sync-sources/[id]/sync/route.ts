import { prisma } from '@okauto/database';
import { ApiErrorCode } from '@okauto/shared';
import { withAuth, jsonResponse, apiError } from '@/lib/api';
import { enqueueSyncJob } from '@/lib/queue';

export const POST = withAuth(
  async (_request, { auth, params }) => {
    const source = await prisma.syncSource.findFirst({
      where: { id: params!.id, organizationId: auth.orgId },
    });
    if (!source) return apiError(ApiErrorCode.SYNC_SOURCE_NOT_FOUND, 404);

    try {
      const jobId = await enqueueSyncJob(source.id);
      return jsonResponse({ queued: true, jobId });
    } catch (err) {
      console.error('Failed to enqueue sync job:', err);
      return apiError(ApiErrorCode.SYNC_QUEUE_UNAVAILABLE, 503);
    }
  },
  { minRole: 'MANAGER' }
);
