import { prisma } from '@okauto/database';
import { withAuth, jsonResponse, errorResponse } from '@/lib/api';
import { enqueueSyncJob } from '@/lib/queue';

export const POST = withAuth(
  async (_request, { auth, params }) => {
    const source = await prisma.syncSource.findFirst({
      where: { id: params!.id, organizationId: auth.orgId },
    });
    if (!source) return errorResponse('Sync source not found', 404);

    try {
      const jobId = await enqueueSyncJob(source.id);
      return jsonResponse({ queued: true, jobId });
    } catch (err) {
      console.error('Failed to enqueue sync job:', err);
      return errorResponse('Failed to queue sync job. Is Redis running?', 503);
    }
  },
  { minRole: 'MANAGER' }
);
