import { NextRequest } from "next/server";
import { db } from "@okauto/db";
import { describeSchema } from "@okauto/shared";
import { authenticateRequest } from "@/lib/auth";
import { generateDescription, promptHash } from "@/lib/ai";
import { handleRouteError, jsonError, jsonOk } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) return jsonError(auth.error, auth.status);
    const { id } = await ctx.params;
    const opts = describeSchema.parse(await req.json().catch(() => ({})));

    const vehicle = await db.vehicle.findFirst({ where: { id, orgId: auth.org.id } });
    if (!vehicle) return jsonError("Vehicle not found", 404);

    const hash = promptHash(vehicle.id, opts);
    const cached = await db.descriptionCache.findUnique({
      where: { vehicleId_promptHash: { vehicleId: vehicle.id, promptHash: hash } },
    });
    if (cached) {
      return jsonOk({ description: cached.body, provider: cached.provider, cached: true });
    }

    const result = await generateDescription(vehicle, opts);
    await db.descriptionCache.create({
      data: {
        vehicleId: vehicle.id,
        promptHash: hash,
        body: result.body,
        provider: result.provider,
      },
    });

    return jsonOk({ description: result.body, provider: result.provider, cached: false });
  } catch (err) {
    return handleRouteError(err);
  }
}
