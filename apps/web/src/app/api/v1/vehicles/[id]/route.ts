import { NextRequest } from "next/server";
import { db } from "@okauto/db";
import { describeSchema } from "@okauto/shared";
import { authenticateRequest } from "@/lib/auth";
import { generateDescription, promptHash } from "@/lib/ai";
import { handleRouteError, jsonError, jsonOk } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) return jsonError(auth.error, auth.status);
    const { id } = await ctx.params;
    const vehicle = await db.vehicle.findFirst({
      where: { id, orgId: auth.org.id },
      include: {
        media: { orderBy: { sortOrder: "asc" } },
        listings: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!vehicle) return jsonError("Vehicle not found", 404);
    return jsonOk({ vehicle });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  // Used only via /describe subroute — keep detail GET above
  void req;
  void ctx;
  return jsonError("Use /describe for description generation", 405);
}
