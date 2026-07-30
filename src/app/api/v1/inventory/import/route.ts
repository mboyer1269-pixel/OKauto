import type { NextRequest } from "next/server";
import { parse } from "csv-parse/sync";

import { audit } from "@/lib/audit";
import { authenticate, requireRole } from "@/lib/auth";
import { ApiError, assertMutationOrigin, errorResponse, json, requestId } from "@/lib/http";
import { importInventory, importPayload } from "@/lib/inventory";

export async function POST(request: NextRequest): Promise<Response> {
  const id = requestId(request);
  try {
    assertMutationOrigin(request);
    const context = await authenticate(request);
    requireRole(context, "MANAGER");
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 10 * 1024 * 1024) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Inventory imports are limited to 10 MB.");
    const contentType = request.headers.get("content-type")?.split(";")[0];
    const payload =
      contentType === "text/csv"
        ? importPayload.parse({
            sourceId: request.nextUrl.searchParams.get("sourceId"),
            completeSnapshot: request.nextUrl.searchParams.get("completeSnapshot") === "true",
            vehicles: parse<Record<string, string>>(await request.text(), {
              bom: true,
              columns: true,
              skip_empty_lines: true,
              trim: true,
            }).map((row) => ({
              vin: row.vin,
              stockNumber: row.stockNumber ?? row.stock_number,
              year: row.year,
              make: row.make,
              model: row.model,
              trim: row.trim,
              mileage: row.mileage || null,
              priceCents: row.priceCents ?? (row.price ? Math.round(Number(row.price) * 100) : undefined),
              status: row.status || "AVAILABLE",
              exteriorColor: row.exteriorColor ?? row.exterior_color,
              transmission: row.transmission,
              fuelType: row.fuelType ?? row.fuel_type,
              bodyStyle: row.bodyStyle ?? row.body_style,
              photos: (row.photos ?? "").split("|").filter(Boolean),
              facts: {},
            })),
          })
        : importPayload.parse(await request.json());
    const counts = await importInventory(context.organization.id, payload);
    await audit(context, request, "inventory.imported", "inventory_source", payload.sourceId, { counts });
    return json({ counts }, { status: 202 }, id);
  } catch (error) {
    return errorResponse(error, id);
  }
}
