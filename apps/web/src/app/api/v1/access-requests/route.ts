import { prisma } from "@okauto/database";
import { createAccessRequestSchema } from "@okauto/shared";
import {
  handleApiError,
  jsonResponse,
  parseBody,
  withAuth,
} from "@/lib/api";
import { getClientIp } from "@/lib/client-ip";
import { enforceAccessRequestRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const limitedIp = await enforceAccessRequestRateLimit(request);
    if (limitedIp) return limitedIp;

    const body = await parseBody<unknown>(request);
    const data = createAccessRequestSchema.parse(body);

    const limitedEmail = await enforceAccessRequestRateLimit(
      request,
      data.email,
    );
    if (limitedEmail) return limitedEmail;

    const created = await prisma.accessRequest.create({
      data: {
        name: data.name,
        dealership: data.dealership,
        email: data.email,
        phone: data.phone,
        message: data.message,
        consentAt: new Date(),
        ipAddress: getClientIp(request),
      },
      select: { id: true, createdAt: true },
    });

    return jsonResponse({ ok: true, id: created.id }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

export const GET = withAuth(
  async (request) => {
    const url = new URL(request.url);
    const parsedLimit = Number.parseInt(
      url.searchParams.get("limit") ?? "50",
      10,
    );
    const take = Math.min(100, Math.max(1, parsedLimit || 50));

    const requests = await prisma.accessRequest.findMany({
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        name: true,
        dealership: true,
        email: true,
        phone: true,
        message: true,
        consentAt: true,
        createdAt: true,
      },
    });

    return jsonResponse({ requests });
  },
  { platformAdmin: true },
);
