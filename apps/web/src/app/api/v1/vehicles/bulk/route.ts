import { prisma } from '@okauto/database';
import { bulkUpdateVehiclesSchema } from '@okauto/shared';
import { withAuth, jsonResponse, parseBody } from '@/lib/api';
import { notifySoldVehicle } from '@/lib/services';

export const POST = withAuth(
  async (request, { auth }) => {
    const body = await parseBody<unknown>(request);
    const data = bulkUpdateVehiclesSchema.parse(body);

    const updateData: Record<string, unknown> = {};
    if (data.status) updateData.status = data.status;
    if (data.assignedToId !== undefined) updateData.assignedToId = data.assignedToId;
    if (data.status === 'SOLD') updateData.soldAt = new Date();

    const result = await prisma.vehicle.updateMany({
      where: { id: { in: data.vehicleIds }, organizationId: auth.orgId },
      data: updateData,
    });

    if (data.status === 'SOLD') {
      for (const id of data.vehicleIds) {
        await notifySoldVehicle(id, auth.orgId);
      }
    }

    return jsonResponse({ updated: result.count });
  },
  { minRole: 'MANAGER' }
);
