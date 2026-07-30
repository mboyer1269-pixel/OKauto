import { generateDescription, vehicleTitle } from "@lotpilot/core";
import { orgSettings, prisma } from "@lotpilot/db";
import { z } from "zod";
import { audit, handler, json, parseBody, requireOrgRole } from "@/server/api";
import { env } from "@/server/env";

type Ctx = { params: Promise<{ orgId: string }> };

const schema = z.object({
  action: z.enum(["archive", "mark_sold", "mark_available", "generate_descriptions"]),
  vehicleIds: z.array(z.string().min(1)).min(1).max(200),
});

export const POST = handler<Ctx>(async (req, ctx) => {
  const { orgId } = await ctx.params;
  const { user } = await requireOrgRole(req, orgId, "MANAGER");
  const { action, vehicleIds } = await parseBody(req, schema);

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const settings = orgSettings(org.settings);

  const vehicles = await prisma.vehicle.findMany({
    where: { id: { in: vehicleIds }, organizationId: orgId },
  });
  const foundIds = new Set(vehicles.map((v) => v.id));

  const results: Array<{ vehicleId: string; ok: boolean; error?: string }> = [];
  for (const id of vehicleIds) {
    if (!foundIds.has(id)) {
      results.push({ vehicleId: id, ok: false, error: "Vehicle not found in this organization" });
      continue;
    }
    const vehicle = vehicles.find((v) => v.id === id)!;
    try {
      switch (action) {
        case "archive":
          await prisma.vehicle.update({ where: { id }, data: { status: "ARCHIVED" } });
          break;
        case "mark_available":
          await prisma.vehicle.update({
            where: { id },
            data: { status: "AVAILABLE", soldAt: null, missingSinceSyncs: 0 },
          });
          break;
        case "mark_sold": {
          await prisma.vehicle.update({
            where: { id },
            data: { status: "SOLD", soldAt: new Date() },
          });
          await prisma.listing.updateMany({
            where: { vehicleId: id, status: "POSTED" },
            data: { status: "DELIST_REQUESTED" },
          });
          const listers = await prisma.listing.findMany({
            where: { vehicleId: id, status: { in: ["DELIST_REQUESTED", "PREPARED"] } },
            distinct: ["userId"],
          });
          for (const listing of listers) {
            await prisma.notification.create({
              data: {
                organizationId: orgId,
                userId: listing.userId,
                type: "VEHICLE_SOLD",
                title: "Vehicle sold — delist your Marketplace post",
                body: `${vehicleTitle(vehicle)} was marked sold. Please remove your Facebook Marketplace listing.`,
                data: { vehicleId: id, listingId: listing.id },
              },
            });
          }
          break;
        }
        case "generate_descriptions": {
          const result = await generateDescription(
            vehicle,
            {
              dealershipName: org.name,
              phone: org.phone,
              disclaimers: settings.disclaimers,
              tone: settings.defaultTone,
            },
            env.openai ?? undefined,
          );
          await prisma.vehicle.update({
            where: { id },
            data: {
              description: result.text,
              descriptionSource: result.source === "ai" ? "AI" : "TEMPLATE",
            },
          });
          break;
        }
      }
      results.push({ vehicleId: id, ok: true });
    } catch (err) {
      results.push({
        vehicleId: id,
        ok: false,
        error: err instanceof Error ? err.message : "failed",
      });
    }
  }

  await audit(req, {
    organizationId: orgId,
    userId: user.id,
    action: `vehicles.bulk_${action}`,
    data: { count: vehicleIds.length, failed: results.filter((r) => !r.ok).length },
  });

  return json({
    results,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });
});
