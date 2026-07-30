import { NextRequest } from "next/server";
import { db } from "@okauto/db";
import { authenticateRequest } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/http";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) return jsonError(auth.error, auth.status);

    const url = new URL(req.url);
    const q = url.searchParams.get("q");

    const vehicles = await db.vehicle.findMany({
      where: {
        orgId: auth.org.id,
        status: "AVAILABLE",
        ...(q
          ? {
              OR: [
                { stockNumber: { contains: q, mode: "insensitive" } },
                { make: { contains: q, mode: "insensitive" } },
                { model: { contains: q, mode: "insensitive" } },
                { vin: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        listings: {
          none: {
            status: { in: ["PUBLISHED", "ASSISTING", "READY", "PRICE_STALE"] },
          },
        },
      },
      include: {
        media: { orderBy: { sortOrder: "asc" }, take: 8 },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    const alerts = await db.listing.findMany({
      where: {
        orgId: auth.org.id,
        userId: auth.user.id,
        status: { in: ["NEEDS_REMOVAL", "PRICE_STALE"] },
      },
      include: {
        vehicle: { select: { year: true, make: true, model: true, stockNumber: true } },
      },
      take: 20,
    });

    return jsonOk({
      vehicles,
      alerts,
      policy: {
        humanInTheLoop: true,
        neverBypassCaptcha: true,
        neverAutoPublish: true,
        instructions:
          "OKauto assists form fill only. Complete any Facebook challenges yourself and click Publish manually.",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
