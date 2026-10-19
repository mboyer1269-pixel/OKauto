import { prisma } from '@okauto/database';
import { ApiErrorCode } from '@okauto/shared';
import { withAuth, jsonResponse, apiError } from '@/lib/api';
import { createAuditLog } from '@/lib/auth';
import { deleteStoredObject } from '@/lib/storage';

export const DELETE = withAuth(
  async (request, { auth, params }) => {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: params!.id, organizationId: auth.orgId },
    });
    if (!vehicle) return apiError(ApiErrorCode.VEHICLE_NOT_FOUND, 404);

    const photo = await prisma.vehiclePhoto.findFirst({
      where: { id: params!.photoId, vehicleId: params!.id },
    });
    if (!photo) return apiError(ApiErrorCode.PHOTO_NOT_FOUND, 404);

    if (photo.storageKey) {
      await deleteStoredObject(photo.storageKey).catch(console.warn);
    }

    await prisma.vehiclePhoto.delete({ where: { id: photo.id } });

    if (photo.isPrimary) {
      const next = await prisma.vehiclePhoto.findFirst({
        where: { vehicleId: params!.id },
        orderBy: { sortOrder: 'asc' },
      });
      if (next) {
        await prisma.vehiclePhoto.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
    }

    await createAuditLog({
      organizationId: auth.orgId,
      userId: auth.sub,
      action: 'DELETE',
      entityType: 'vehicle_photo',
      entityId: photo.id,
      metadata: { vehicleId: params!.id },
      request: request as never,
    });

    return jsonResponse({ success: true });
  },
  { minRole: 'MANAGER' }
);
