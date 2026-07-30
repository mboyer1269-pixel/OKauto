import { NextRequest } from "next/server";
import { db } from "@okauto/db";
import { authenticateRequest } from "@/lib/auth";
import { enqueueInventorySync, enqueueSoldDetection } from "@/lib/queue";
import { handleRouteError, jsonError, jsonOk } from "@/lib/http";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, "MANAGER");
    if ("error" in auth) return jsonError(auth.error, auth.status);
    const sources = await db.inventorySource.findMany({
      where: { orgId: auth.org.id },
      orderBy: { createdAt: "asc" },
    });
    return jsonOk({ sources });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, "MANAGER");
    if ("error" in auth) return jsonError(auth.error, auth.status);
    const body = (await req.json().catch(() => ({}))) as {
      sourceId?: string;
      action?: "sync" | "detect-sold";
    };

    if (body.action === "detect-sold") {
      await enqueueSoldDetection(auth.org.id);
      return jsonOk({ queued: "detect-sold" });
    }

    await enqueueInventorySync(auth.org.id, body.sourceId);
    return jsonOk({ queued: "sync" });
  } catch (err) {
    return handleRouteError(err);
  }
}
