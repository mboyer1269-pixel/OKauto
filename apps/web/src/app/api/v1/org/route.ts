import { NextRequest } from "next/server";
import { db } from "@okauto/db";
import { authenticateRequest } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { handleRouteError, jsonError, jsonOk } from "@/lib/http";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) return jsonError(auth.error, auth.status);
    const org = await db.organization.findUnique({ where: { id: auth.org.id } });
    return jsonOk({ organization: org, role: auth.membership.role });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, "ADMIN");
    if ("error" in auth) return jsonError(auth.error, auth.status);
    const body = (await req.json()) as {
      name?: string;
      timezone?: string;
      settings?: Record<string, unknown>;
    };

    const org = await db.organization.update({
      where: { id: auth.org.id },
      data: {
        name: body.name,
        timezone: body.timezone,
        settings: body.settings as never,
      },
    });

    await writeAudit(auth, "ORG_UPDATED", "Organization", org.id, body);
    return jsonOk({ organization: org });
  } catch (err) {
    return handleRouteError(err);
  }
}
