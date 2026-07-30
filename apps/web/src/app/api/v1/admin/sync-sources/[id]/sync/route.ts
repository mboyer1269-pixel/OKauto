import { prisma } from '@okauto/database';
import { withAuth, jsonResponse, errorResponse } from '@/lib/api';
import { enqueueSyncJob } from '@/lib/queue';

export const POST = withAuth(
  async (_request, { auth, params }) => {
    const source = await prisma.syncSource.findFirst({
      where: { id: params!.id, organizationId: auth.orgId },
    });
    if (!source) return errorResponse('Sync source not found', 404);

    const jobId = await enqueueSyncJob(source.id);
    return jsonResponse({ queued: true, jobId });
  },
  { minRole: 'MANAGER' }
);
