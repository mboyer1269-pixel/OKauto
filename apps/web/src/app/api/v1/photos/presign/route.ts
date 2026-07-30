import { withAuth, jsonResponse, errorResponse, parseBody } from '@/lib/api';
import { presignPhotoSchema } from '@okauto/shared';
import { prisma } from '@okauto/database';
import { createPresignedUpload, isStorageConfigured } from '@/lib/storage';

export const GET = withAuth(async () => {
  return jsonResponse({ configured: isStorageConfigured() });
});

export const POST = withAuth(
  async (request, { auth }) => {
    if (!isStorageConfigured()) {
      return errorResponse('S3 storage is not configured. Set AWS_S3_BUCKET and AWS_S3_PUBLIC_URL.', 503);
    }

    const body = await parseBody<unknown>(request);
    const data = presignPhotoSchema.parse(body);

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: data.vehicleId, organizationId: auth.orgId },
    });
    if (!vehicle) return errorResponse('Vehicle not found', 404);

    const result = await createPresignedUpload({
      organizationId: auth.orgId,
      vehicleId: data.vehicleId,
      filename: data.filename,
      contentType: data.contentType,
    });

    return jsonResponse(result);
  },
  { minRole: 'MANAGER' }
);
