import { NextRequest } from "next/server";
import { prisma } from "@okauto/database";
import { authenticateApiKey } from "@/lib/auth";
import {
  jsonResponse,
  errorResponse,
  handleApiError,
  parseBody,
} from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody<{ apiKey: string }>(request);
    if (!body.apiKey) return errorResponse("API key required", 401);

    const auth = await authenticateApiKey(body.apiKey);
    if (!auth) return errorResponse("Invalid API key", 401);

    return jsonResponse({
      user: { id: auth.user.id, name: auth.user.name, email: auth.user.email },
      organization: { id: auth.organization.id, name: auth.organization.name },
      role: auth.role,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey) return errorResponse("API key required", 401);

    const auth = await authenticateApiKey(apiKey);
    if (!auth) return errorResponse("Invalid API key", 401);

    const vehicles = await prisma.vehicle.findMany({
      where: { organizationId: auth.orgId, status: "AVAILABLE" },
      include: {
        photos: { orderBy: { sortOrder: "asc" } },
        listings: {
          where: { status: "ACTIVE" },
          select: { id: true, status: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 250,
    });

    return jsonResponse({
      user: { id: auth.user.id, name: auth.user.name, email: auth.user.email },
      organization: {
        id: auth.organization.id,
        name: auth.organization.name,
        city: auth.organization.city,
        state: auth.organization.state,
        phone: auth.organization.phone,
      },
      vehicles: vehicles.map((v) => ({
        id: v.id,
        vin: v.vin,
        stockNumber: v.stockNumber,
        year: v.year,
        make: v.make,
        model: v.model,
        trim: v.trim,
        mileage: v.mileage,
        price: v.price ? Number(v.price) : null,
        exteriorColor: v.exteriorColor,
        transmission: v.transmission,
        fuelType: v.fuelType,
        description: v.description,
        contactName: auth.user.name,
        dealershipName: auth.organization.name,
        phone: auth.organization.phone,
        bodyStyle: v.bodyStyle,
        condition: v.condition,
        photos: v.photos.map((p) => p.url),
        hasActiveListing: v.listings.length > 0,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
