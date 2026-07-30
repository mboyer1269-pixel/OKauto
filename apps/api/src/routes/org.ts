import type { FastifyInstance } from 'fastify';
import { inviteSchema, hasMinRole } from '@okauto/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate, orgIdsFor, requireRole, roleInOrg } from '../lib/auth.js';
import { writeAudit } from '../lib/audit.js';
import { hashPassword, randomToken, sha256 } from '../lib/crypto.js';

export async function orgRoutes(app: FastifyInstance) {
  // Public invite acceptance (no auth)
  app.post('/v1/invites/accept', async (request, reply) => {
    const body = z
      .object({
        token: z.string().min(10),
        password: z.string().min(10).max(128),
        firstName: z.string().min(1).max(80),
        lastName: z.string().min(1).max(80),
      })
      .parse(request.body);

    const invite = await prisma.invite.findUnique({ where: { tokenHash: sha256(body.token) } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      return reply.code(400).send({ error: { code: 'invalid_invite', message: 'Invite invalid or expired' } });
    }

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email: invite.email } });
      const u =
        existing ??
        (await tx.user.create({
          data: {
            email: invite.email,
            passwordHash,
            firstName: body.firstName,
            lastName: body.lastName,
          },
        }));
      if (existing) {
        await tx.user.update({ where: { id: existing.id }, data: { passwordHash } });
      }
      await tx.membership.create({
        data: {
          userId: u.id,
          organizationId: invite.organizationId,
          dealershipId: invite.dealershipId,
          role: invite.role,
        },
      });
      await tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      return u;
    });

    return { ok: true, userId: user.id };
  });

  app.addHook('preHandler', authenticate);

  app.get('/v1/dealerships', async (request) => {
    const orgIds = orgIdsFor(request.user!);
    const items = await prisma.dealership.findMany({
      where: { organizationId: { in: orgIds } },
      orderBy: { name: 'asc' },
    });
    return { items };
  });

  app.post('/v1/dealerships', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const body = z
      .object({
        organizationId: z.string().uuid(),
        name: z.string().min(2).max(160),
        website: z.string().url().optional(),
        phone: z.string().max(40).optional(),
        city: z.string().max(80).optional(),
        state: z.string().max(40).optional(),
        postalCode: z.string().max(20).optional(),
        timezone: z.string().max(80).optional(),
      })
      .parse(request.body);

    const role = roleInOrg(request.user!, body.organizationId);
    if (!role || !hasMinRole(role, 'admin')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'No access' } });
    }

    const dealership = await prisma.dealership.create({ data: body });
    await writeAudit({
      organizationId: body.organizationId,
      actorId: request.user!.id,
      action: 'dealership.create',
      entityType: 'dealership',
      entityId: dealership.id,
      ip: request.ip,
    });
    return dealership;
  });

  app.get('/v1/members', async (request) => {
    const orgIds = orgIdsFor(request.user!);
    const items = await prisma.membership.findMany({
      where: { organizationId: { in: orgIds } },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, isActive: true } },
        dealership: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return { items };
  });

  app.post('/v1/invites', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const body = inviteSchema.parse(request.body);
    const orgId = orgIdsFor(request.user!)[0];
    if (!orgId) {
      return reply.code(400).send({ error: { code: 'no_org', message: 'No organization' } });
    }
    const role = roleInOrg(request.user!, orgId);
    if (!role || !hasMinRole(role, 'admin')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'No access' } });
    }

    const raw = randomToken(24);
    const invite = await prisma.invite.create({
      data: {
        organizationId: orgId,
        dealershipId: body.dealershipId,
        email: body.email.toLowerCase(),
        role: body.role,
        tokenHash: sha256(raw),
        invitedById: request.user!.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await writeAudit({
      organizationId: orgId,
      actorId: request.user!.id,
      action: 'invite.create',
      entityType: 'invite',
      entityId: invite.id,
      meta: { email: body.email, role: body.role },
      ip: request.ip,
    });

    // In production, email the token. For MVP, return it for dashboard copy.
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      acceptToken: raw,
      acceptPath: `/accept-invite?token=${raw}`,
    };
  });

  app.get('/v1/notifications', async (request) => {
    const query = z
      .object({
        unreadOnly: z
          .union([z.literal('true'), z.literal('false')])
          .optional()
          .transform((v) => v === 'true'),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
      })
      .parse(request.query);

    const where = {
      userId: request.user!.id,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  });

  app.post('/v1/notifications/:id/read', async (request, reply) => {
    const { id } = request.params as { id: string };
    const n = await prisma.notification.findUnique({ where: { id } });
    if (!n || n.userId !== request.user!.id) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
    }
    const updated = await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return updated;
  });

  app.post('/v1/notifications/read-all', async (request) => {
    await prisma.notification.updateMany({
      where: { userId: request.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  });

  app.get('/v1/analytics/summary', { preHandler: [requireRole('manager')] }, async (request) => {
    const orgIds = orgIdsFor(request.user!);
    const dealerships = await prisma.dealership.findMany({
      where: { organizationId: { in: orgIds } },
      select: { id: true, name: true },
    });
    const dealershipIds = dealerships.map((d) => d.id);

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [vehiclesByStatus, listingsLast30, events, members] = await Promise.all([
      prisma.vehicle.groupBy({
        by: ['status'],
        where: { dealershipId: { in: dealershipIds } },
        _count: true,
      }),
      prisma.listing.groupBy({
        by: ['salespersonId', 'status'],
        where: { dealershipId: { in: dealershipIds }, createdAt: { gte: since } },
        _count: true,
      }),
      prisma.listingEvent.groupBy({
        by: ['type'],
        where: {
          listing: { dealershipId: { in: dealershipIds } },
          createdAt: { gte: since },
        },
        _count: true,
      }),
      prisma.membership.findMany({
        where: { organizationId: { in: orgIds } },
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      }),
    ]);

    const userMap = new Map(members.map((m) => [m.user.id, m.user]));
    const bySalesperson: Record<
      string,
      { user: { id: string; firstName: string; lastName: string; email: string }; counts: Record<string, number> }
    > = {};

    for (const row of listingsLast30) {
      const user = userMap.get(row.salespersonId);
      if (!user) continue;
      if (!bySalesperson[row.salespersonId]) {
        bySalesperson[row.salespersonId] = { user, counts: {} };
      }
      bySalesperson[row.salespersonId].counts[row.status] = row._count;
    }

    const sources = await prisma.inventorySource.findMany({
      where: { dealershipId: { in: dealershipIds } },
      select: {
        id: true,
        name: true,
        type: true,
        lastSyncAt: true,
        lastStatus: true,
        isActive: true,
      },
    });

    return {
      periodDays: 30,
      vehiclesByStatus: Object.fromEntries(vehiclesByStatus.map((v) => [v.status, v._count])),
      eventsByType: Object.fromEntries(events.map((e) => [e.type, e._count])),
      bySalesperson: Object.values(bySalesperson),
      syncHealth: sources,
      dealerships,
    };
  });

  app.get('/v1/audit-logs', { preHandler: [requireRole('admin')] }, async (request) => {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query);
    const orgIds = orgIdsFor(request.user!);
    const where = { organizationId: { in: orgIds } };
    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  });
}
