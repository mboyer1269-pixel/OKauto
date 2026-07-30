import { prisma } from '@okauto/db';
import { registerSchema } from '@okauto/shared';
import { hashPassword } from '@okauto/shared/password';
import { handler, httpErrors, jsonOk, parseJson } from '@/lib/http';
import { createSessionToken, setSessionCookie } from '@/lib/auth';
import { audit, clientIp } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'org';
}

export const POST = handler(async (req) => {
  const input = await parseJson(req, registerSchema);

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw httpErrors.conflict('An account with that email already exists');

  const passwordHash = await hashPassword(input.password);

  // Ensure a unique org slug.
  const base = slugify(input.organizationName);
  let slug = base;
  for (let i = 1; await prisma.organization.findUnique({ where: { slug } }); i += 1) {
    slug = `${base}-${i}`;
  }

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: input.email, name: input.name, passwordHash },
    });
    const org = await tx.organization.create({
      data: { name: input.organizationName, slug },
    });
    await tx.membership.create({
      data: { userId: user.id, organizationId: org.id, role: 'OWNER' },
    });
    return { user, org };
  });

  await audit({
    organizationId: result.org.id,
    actorId: result.user.id,
    action: 'auth.register',
    ip: clientIp(req),
  });

  const token = await createSessionToken({
    sub: result.user.id,
    email: result.user.email,
    name: result.user.name,
    isSuperAdmin: result.user.isSuperAdmin,
  });
  await setSessionCookie(token);

  return jsonOk(
    {
      user: { id: result.user.id, email: result.user.email, name: result.user.name },
      organization: { id: result.org.id, name: result.org.name, slug: result.org.slug },
    },
    { status: 201 },
  );
});
