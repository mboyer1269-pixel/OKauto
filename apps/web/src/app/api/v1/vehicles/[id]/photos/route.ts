import { prisma } from '@okauto/database';
import { addPhotoSchema } from '@okauto/shared';
import { withAuth, jsonResponse, errorResponse, parseBody } from '@/lib/api';
import { createAuditLog } from '@/lib/auth';

export const POST = withAuth(
  async (request, { auth, params }) => {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: params!.id, organizationId: auth.orgId },
    });
    if (!vehicle) return errorResponse('Vehicle not found', 404);

    const body = await parseBody<unknown>(request);
    const data = addPhotoSchema.parse(body);

    const count = await prisma.vehiclePhoto.count({ where: { vehicleId: params!.id } });

    if (data.isPrimary) {
      await prisma.vehiclePhoto.updateMany({
        where: { vehicleId: params!.id },
        data: { isPrimary: false },
      });
    }

    const photo = await prisma.vehiclePhoto.create({
      data: {
        vehicleId: params!.id,
        url: data.url,
        storageKey: data.storageKey,
        sortOrder: data.sortOrder ?? count,
        isPrimary: data.isPrimary ?? count === 0,
      },
    });

    await createAuditLog({
      organizationId: auth.orgId,
      userId: auth.sub,
      action: 'CREATE',
      entityType: 'vehicle_photo',
      entityId: photo.id,
      metadata: { vehicleId: params!.id },
      request: request as never,
    });

    return jsonResponse(photo, 201);
  },
  { minRole: 'MANAGER' }
);
