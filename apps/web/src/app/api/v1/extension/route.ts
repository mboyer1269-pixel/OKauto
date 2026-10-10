import { NextRequest } from "next/server";
import { prisma } from "@okauto/database";
import { onSaleInventoryWhere } from "@/lib/on-sale-query";
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

    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim();
    const requestedPage = Number.parseInt(
      url.searchParams.get("page") ?? "1",
      10,
    );
    const requestedLimit = Number.parseInt(
      url.searchParams.get("limit") ?? "50",
      10,
    );
    const page = Number.isFinite(requestedPage)
      ? Math.max(1, requestedPage)
      : 1;
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(50, Math.max(1, requestedLimit))
      : 50;
    const where = {
      organizationId: auth.orgId,
      ...(await onSaleInventoryWhere(auth.orgId)),
      ...(search
        ? {
            OR: [
              {
                stockNumber: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              { vin: { contains: search, mode: "insensitive" as const } },
              { make: { contains: search, mode: "insensitive" as const } },
              { model: { contains: search, mode: "insensitive" as const } },
              { trim: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [vehicles, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        include: {
          photos: { orderBy: { sortOrder: "asc" }, take: 1 },
          _count: { select: { photos: true } },
          listings: {
            where: { status: "ACTIVE", userId: auth.user.id },
            select: { id: true, status: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.vehicle.count({ where }),
    ]);

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
        bodyStyle: v.bodyStyle,
        condition: v.condition,
        photos: v.photos.map((p) => p.url),
        photoCount: v._count.photos,
        hasActiveListing: v.listings.length > 0,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
