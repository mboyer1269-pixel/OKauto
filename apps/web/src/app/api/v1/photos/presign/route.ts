import { withAuth, jsonResponse, apiError, parseBody } from '@/lib/api';
import { ApiErrorCode, presignPhotoSchema } from '@okauto/shared';
import { prisma } from '@okauto/database';
import { createPresignedUpload, isStorageConfigured } from '@/lib/storage';

export const GET = withAuth(async () => {
  return jsonResponse({ configured: isStorageConfigured() });
});

export const POST = withAuth(
  async (request, { auth }) => {
    if (!isStorageConfigured()) {
      return apiError(ApiErrorCode.STORAGE_NOT_CONFIGURED, 503);
    }

    const body = await parseBody<unknown>(request);
    const data = presignPhotoSchema.parse(body);

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: data.vehicleId, organizationId: auth.orgId },
    });
    if (!vehicle) return apiError(ApiErrorCode.VEHICLE_NOT_FOUND, 404);

    const result = await createPresignedUpload({
      organizationId: auth.orgId,
      vehicleId: data.vehicleId,
      filename: data.filename,
      contentType: data.contentType,
    });

    return jsonResponse(result);
  },
  { minRole: 'SALESPERSON' }
);
