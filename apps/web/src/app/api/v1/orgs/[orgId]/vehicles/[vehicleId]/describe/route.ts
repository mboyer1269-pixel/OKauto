import { generateDescription } from "@lotpilot/core";
import { orgSettings, prisma } from "@lotpilot/db";
import { z } from "zod";
import {
  audit,
  handler,
  json,
  notFound,
  parseBody,
  requireOrgRole,
  tooManyRequests,
} from "@/server/api";
import { env } from "@/server/env";
import { rateLimit } from "@/server/ratelimit";

type Ctx = { params: Promise<{ orgId: string; vehicleId: string }> };

const schema = z.object({
  tone: z.enum(["professional", "friendly", "energetic"]).optional(),
  save: z.boolean().default(true),
});

export const POST = handler<Ctx>(async (req, ctx) => {
  const { orgId, vehicleId } = await ctx.params;
  const { user } = await requireOrgRole(req, orgId);
  if (!rateLimit(`describe:${user.id}`, 30, 60_000)) throw tooManyRequests();
  const body = await parseBody(req, schema);

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, organizationId: orgId },
  });
  if (!vehicle) throw notFound("Vehicle not found");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const settings = orgSettings(org.settings);

  const result = await generateDescription(
    vehicle,
    {
      dealershipName: org.name,
      phone: org.phone,
      disclaimers: settings.disclaimers,
      tone: body.tone ?? settings.defaultTone,
    },
    env.openai ?? undefined,
  );

  if (body.save) {
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        description: result.text,
        descriptionSource: result.source === "ai" ? "AI" : "TEMPLATE",
      },
    });
  }
  await audit(req, {
    organizationId: orgId,
    userId: user.id,
    action: "vehicle.describe",
    entityType: "vehicle",
    entityId: vehicleId,
    data: { source: result.source, saved: body.save },
  });
  return json({ description: result.text, source: result.source });
});
