import { NextRequest } from "next/server";
import { db } from "@okauto/db";
import { authenticateRequest } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/http";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) return jsonError(auth.error, auth.status);

    const items = await db.notification.findMany({
      where: { orgId: auth.org.id, userId: auth.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return jsonOk({ items });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) return jsonError(auth.error, auth.status);
    const body = (await req.json()) as { ids?: string[]; markAll?: boolean };

    if (body.markAll) {
      await db.notification.updateMany({
        where: { orgId: auth.org.id, userId: auth.user.id, readAt: null },
        data: { readAt: new Date() },
      });
    } else if (body.ids?.length) {
      await db.notification.updateMany({
        where: {
          id: { in: body.ids },
          orgId: auth.org.id,
          userId: auth.user.id,
        },
        data: { readAt: new Date() },
      });
    } else {
      return jsonError("Provide ids or markAll");
    }

    return jsonOk({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
