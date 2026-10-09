import { prisma } from "@okauto/database";
import {
  accessRequestIpCutoff,
  accessRequestRecordCutoff,
} from "@okauto/shared";

export async function processAccessRequestRetention(now: Date = new Date()) {
  const ipCutoff = accessRequestIpCutoff(now);
  const recordCutoff = accessRequestRecordCutoff(now);

  const erasedIps = await prisma.accessRequest.updateMany({
    where: {
      ipAddress: { not: null },
      createdAt: { lte: ipCutoff },
    },
    data: { ipAddress: null },
  });

  const deleted = await prisma.accessRequest.deleteMany({
    where: { createdAt: { lte: recordCutoff } },
  });

  return { erasedIps: erasedIps.count, deleted: deleted.count };
}
