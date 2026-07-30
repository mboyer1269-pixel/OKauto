import { NextRequest } from "next/server";
import { db } from "@okauto/db";
import { authenticateRequest } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/http";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, "ADMIN");
    if ("error" in auth) return jsonError(auth.error, auth.status);

    const items = await db.auditLog.findMany({
      where: { orgId: auth.org.id },
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return jsonOk({ items });
  } catch (err) {
    return handleRouteError(err);
  }
}
