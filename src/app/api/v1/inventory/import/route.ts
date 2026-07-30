import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { authenticate, requireRole } from "@/lib/auth";
import { assertMutationOrigin, errorResponse, json, requestId } from "@/lib/http";
import { importInventory, importPayload } from "@/lib/inventory";

export async function POST(request: NextRequest): Promise<Response> {
  const id = requestId(request);
  try {
    assertMutationOrigin(request);
    const context = await authenticate(request);
    requireRole(context, "MANAGER");
    const payload = importPayload.parse(await request.json());
    const counts = await importInventory(context.organization.id, payload);
    await audit(context, request, "inventory.imported", "inventory_source", payload.sourceId, { counts });
    return json({ counts }, { status: 202 }, id);
  } catch (error) {
    return errorResponse(error, id);
  }
}
