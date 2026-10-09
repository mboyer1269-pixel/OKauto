import { prisma } from "@okauto/database";
import { errorResponse, jsonResponse, withAuth } from "@/lib/api";

export const DELETE = withAuth(
  async (_request, { params }) => {
    const id = params?.id;
    if (!id) return errorResponse("Demande introuvable", 404);

    const existing = await prisma.accessRequest.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return errorResponse("Demande introuvable", 404);

    await prisma.accessRequest.delete({ where: { id } });
    return jsonResponse({ ok: true });
  },
  { platformAdmin: true },
);
