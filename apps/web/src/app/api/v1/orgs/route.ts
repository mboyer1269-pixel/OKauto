import { prisma } from "@lotpilot/db";
import { z } from "zod";
import { audit, conflict, handler, json, parseBody, requireUser } from "@/server/api";

export const GET = handler(async (req) => {
  const user = await requireUser(req);
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
  return json({
    organizations: memberships.map((m) => ({
      ...m.organization,
      role: m.role,
    })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  website: z.string().trim().url().optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  state: z.string().trim().max(40).optional().nullable(),
  zip: z.string().trim().max(16).optional().nullable(),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const body = await parseBody(req, createSchema);

  const base = slugify(body.name) || "dealership";
  let slug = base;
  for (let attempt = 1; attempt < 50; attempt++) {
    const taken = await prisma.organization.findUnique({ where: { slug } });
    if (!taken) break;
    slug = `${base}-${attempt + 1}`;
  }
  const stillTaken = await prisma.organization.findUnique({ where: { slug } });
  if (stillTaken) throw conflict("Could not allocate a unique slug for this name");

  const org = await prisma.organization.create({
    data: {
      ...body,
      slug,
      settings: {
        disclaimers: [],
        soldDetectionThreshold: 2,
        defaultTone: "professional",
        defaultLocation: body.city && body.state ? `${body.city}, ${body.state}` : null,
      },
      memberships: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  await audit(req, {
    organizationId: org.id,
    userId: user.id,
    action: "org.create",
    entityType: "organization",
    entityId: org.id,
  });
  return json({ organization: org }, { status: 201 });
});
