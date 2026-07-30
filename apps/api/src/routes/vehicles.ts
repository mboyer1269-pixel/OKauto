import type { FastifyInstance } from 'fastify';
import {
  createVehicleSchema,
  updateVehicleSchema,
  vehicleFilterSchema,
  prepareListingSchema,
  listingEventSchema,
  createInventorySourceSchema,
  hasMinRole,
  listingStatusSchema,
} from '@okauto/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate, orgIdsFor, requireRole, roleInOrg } from '../lib/auth.js';
import { writeAudit } from '../lib/audit.js';
import { generateDescription, prepareListingPayload } from '../services/listing.js';
import {
  parseCsvInventory,
  parseXmlInventory,
  parseWebsiteInventory,
  upsertImportedVehicles,
} from '../services/inventory.js';
import { runInventorySync } from '../services/sync.js';
import { decodeVinLocal, decodeVinRemote } from '../services/vin.js';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { Prisma } from '@prisma/client';

export { runInventorySync };

export async function vehicleRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/v1/vehicles', async (request) => {
    const query = vehicleFilterSchema.parse(request.query);
    const orgIds = orgIdsFor(request.user!);
    const dealerships = await prisma.dealership.findMany({
      where: {
        organizationId: { in: orgIds },
        ...(query.dealershipId ? { id: query.dealershipId } : {}),
      },
      select: { id: true },
    });
    const dealershipIds = dealerships.map((d) => d.id);
    if (!dealershipIds.length) {
      return { items: [], page: query.page, pageSize: query.pageSize, total: 0 };
    }

    const where = {
      dealershipId: { in: dealershipIds },
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { vin: { contains: query.q, mode: 'insensitive' as const } },
              { stockNumber: { contains: query.q, mode: 'insensitive' as const } },
              { make: { contains: query.q, mode: 'insensitive' as const } },
              { model: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.vehicle.count({ where }),
      prisma.vehicle.findMany({
        where,
        include: { media: { orderBy: { sortOrder: 'asc' }, take: 3 } },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: items.map((v) => ({
        ...v,
        price: v.price != null ? Number(v.price) : null,
        previousPrice: v.previousPrice != null ? Number(v.previousPrice) : null,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  });

  app.get('/v1/vehicles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: {
        media: { orderBy: { sortOrder: 'asc' } },
        dealership: true,
        listings: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!vehicle) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Vehicle not found' } });
    }
    const role = roleInOrg(request.user!, vehicle.dealership.organizationId);
    if (!role) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'No access' } });
    }
    return {
      ...vehicle,
      price: vehicle.price != null ? Number(vehicle.price) : null,
      previousPrice: vehicle.previousPrice != null ? Number(vehicle.previousPrice) : null,
    };
  });

  app.post('/v1/vehicles', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const body = createVehicleSchema.parse(request.body);
    const dealership = await prisma.dealership.findUnique({ where: { id: body.dealershipId } });
    if (!dealership) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Dealership not found' } });
    }
    const role = roleInOrg(request.user!, dealership.organizationId);
    if (!role || !hasMinRole(role, 'manager')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'No access' } });
    }

    if (body.vin) {
      const dup = await prisma.vehicle.findFirst({
        where: { dealershipId: body.dealershipId, vin: body.vin.toUpperCase() },
      });
      if (dup) {
        return reply
          .code(409)
          .send({ error: { code: 'duplicate_vin', message: 'VIN already exists', details: { id: dup.id } } });
      }
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        dealershipId: body.dealershipId,
        vin: body.vin?.toUpperCase(),
        stockNumber: body.stockNumber,
        vehicleType: body.vehicleType,
        year: body.year,
        make: body.make,
        model: body.model,
        trim: body.trim,
        bodyStyle: body.bodyStyle,
        exteriorColor: body.exteriorColor,
        interiorColor: body.interiorColor,
        mileage: body.mileage,
        price: body.price,
        currency: body.currency,
        description: body.description,
        status: body.status,
        attributes: (body.attributes ?? {}) as Prisma.InputJsonValue,
        media: body.photoUrls?.length
          ? { create: body.photoUrls.map((url, i) => ({ url, sortOrder: i })) }
          : undefined,
      },
      include: { media: true },
    });

    await writeAudit({
      organizationId: dealership.organizationId,
      actorId: request.user!.id,
      action: 'vehicle.create',
      entityType: 'vehicle',
      entityId: vehicle.id,
      ip: request.ip,
    });

    return {
      ...vehicle,
      price: vehicle.price != null ? Number(vehicle.price) : null,
    };
  });

  app.patch('/v1/vehicles/:id', { preHandler: [requireRole('manager')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateVehicleSchema.parse(request.body);
    const existing = await prisma.vehicle.findUnique({
      where: { id },
      include: { dealership: true },
    });
    if (!existing) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Vehicle not found' } });
    }
    const role = roleInOrg(request.user!, existing.dealership.organizationId);
    if (!role || !hasMinRole(role, 'manager')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'No access' } });
    }

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: {
        ...body,
        vin: body.vin?.toUpperCase(),
        attributes: body.attributes as Prisma.InputJsonValue | undefined,
        soldAt: body.status === 'sold' ? new Date() : undefined,
      },
    });

    await writeAudit({
      organizationId: existing.dealership.organizationId,
      actorId: request.user!.id,
      action: 'vehicle.update',
      entityType: 'vehicle',
      entityId: id,
      meta: body as Prisma.InputJsonValue,
      ip: request.ip,
    });

    return { ...vehicle, price: vehicle.price != null ? Number(vehicle.price) : null };
  });

  app.post('/v1/vehicles/:id/descriptions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: { dealership: true },
    });
    if (!vehicle) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Vehicle not found' } });
    }
    if (!roleInOrg(request.user!, vehicle.dealership.organizationId)) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'No access' } });
    }
    const generated = await generateDescription(request.env, vehicle);
    await prisma.descriptionGeneration.create({
      data: {
        vehicleId: vehicle.id,
        provider: generated.provider,
        model: generated.model,
        output: generated.text,
      },
    });
    await prisma.vehicle.update({
      where: { id },
      data: { aiDescription: generated.text },
    });
    return { description: generated.text, provider: generated.provider, model: generated.model };
  });

  app.post('/v1/vehicles/:id/prepare-listing', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = prepareListingSchema.parse(request.body ?? {});
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: { dealership: true },
    });
    if (!vehicle) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Vehicle not found' } });
    }
    if (!roleInOrg(request.user!, vehicle.dealership.organizationId)) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'No access' } });
    }

    const result = await prepareListingPayload({
      env: request.env,
      vehicleId: id,
      salespersonId: request.user!.id,
      ...body,
    });

    await writeAudit({
      organizationId: vehicle.dealership.organizationId,
      actorId: request.user!.id,
      action: 'listing.prepare',
      entityType: 'listing',
      entityId: result.listingId,
      ip: request.ip,
    });

    return result;
  });

  app.get('/v1/vin/:vin', async (request) => {
    const { vin } = request.params as { vin: string };
    const local = decodeVinLocal(vin);
    const remote = local.validFormat ? await decodeVinRemote(local.vin) : null;
    return { local, remote };
  });
}

export async function listingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/v1/listings', async (request) => {
    const query = z
      .object({
        dealershipId: z.string().uuid().optional(),
        salespersonId: z.string().uuid().optional(),
        status: listingStatusSchema.optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
      })
      .parse(request.query);

    const orgIds = orgIdsFor(request.user!);
    const dealerships = await prisma.dealership.findMany({
      where: {
        organizationId: { in: orgIds },
        ...(query.dealershipId ? { id: query.dealershipId } : {}),
      },
      select: { id: true },
    });

    const where = {
      dealershipId: { in: dealerships.map((d) => d.id) },
      ...(query.salespersonId ? { salespersonId: query.salespersonId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, items] = await Promise.all([
      prisma.listing.count({ where }),
      prisma.listing.findMany({
        where,
        include: {
          vehicle: { select: { id: true, year: true, make: true, model: true, vin: true, stockNumber: true } },
          salesperson: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: items.map((l) => ({
        ...l,
        price: l.price != null ? Number(l.price) : null,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  });

  app.get('/v1/listings/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: {
        vehicle: { include: { media: { orderBy: { sortOrder: 'asc' } } } },
        events: { orderBy: { createdAt: 'desc' }, take: 50 },
        salesperson: { select: { id: true, firstName: true, lastName: true, email: true } },
        dealership: true,
      },
    });
    if (!listing) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Listing not found' } });
    }
    if (!roleInOrg(request.user!, listing.dealership.organizationId)) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'No access' } });
    }
    return {
      ...listing,
      price: listing.price != null ? Number(listing.price) : null,
    };
  });

  app.post('/v1/listings/:id/events', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = listingEventSchema.parse(request.body);
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: { dealership: true },
    });
    if (!listing) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Listing not found' } });
    }
    if (!roleInOrg(request.user!, listing.dealership.organizationId)) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'No access' } });
    }

    const statusMap: Record<string, typeof listing.status | undefined> = {
      filled: 'filled',
      submitted: 'submitted',
      removed: 'removed',
      sold_detected: 'sold',
      failed: 'failed',
    };

    const event = await prisma.listingEvent.create({
      data: {
        listingId: id,
        actorId: request.user!.id,
        type: body.type,
        meta: (body.meta ?? {}) as Prisma.InputJsonValue,
      },
    });

    await prisma.listing.update({
      where: { id },
      data: {
        status: statusMap[body.type] ?? undefined,
        externalListingId: body.externalListingId,
        externalUrl: body.externalUrl,
        submittedAt: body.type === 'submitted' ? new Date() : undefined,
        removedAt: body.type === 'removed' ? new Date() : undefined,
      },
    });

    return { event };
  });
}

export async function inventorySourceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  let syncQueue: Queue | null = null;
  try {
    const connection = new Redis(app.env.REDIS_URL, { maxRetriesPerRequest: null });
    syncQueue = new Queue('inventory-sync', { connection });
  } catch {
    syncQueue = null;
  }

  app.get('/v1/inventory/sources', async (request) => {
    const orgIds = orgIdsFor(request.user!);
    const sources = await prisma.inventorySource.findMany({
      where: { dealership: { organizationId: { in: orgIds } } },
      include: {
        dealership: { select: { id: true, name: true } },
        syncRuns: { orderBy: { startedAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { items: sources };
  });

  app.post('/v1/inventory/sources', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const body = createInventorySourceSchema.parse(request.body);
    const dealership = await prisma.dealership.findUnique({ where: { id: body.dealershipId } });
    if (!dealership) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Dealership not found' } });
    }
    const role = roleInOrg(request.user!, dealership.organizationId);
    if (!role || !hasMinRole(role, 'admin')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'No access' } });
    }
    const source = await prisma.inventorySource.create({
      data: {
        dealershipId: body.dealershipId,
        name: body.name,
        type: body.type,
        config: body.config,
      },
    });
    await writeAudit({
      organizationId: dealership.organizationId,
      actorId: request.user!.id,
      action: 'inventory_source.create',
      entityType: 'inventory_source',
      entityId: source.id,
      ip: request.ip,
    });
    return source;
  });

  app.post('/v1/inventory/sources/:id/sync', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const source = await prisma.inventorySource.findUnique({
      where: { id },
      include: { dealership: true },
    });
    if (!source) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Source not found' } });
    }
    const role = roleInOrg(request.user!, source.dealership.organizationId);
    if (!role || !hasMinRole(role, 'admin')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'No access' } });
    }

    const run = await prisma.syncRun.create({
      data: { sourceId: source.id, status: 'pending' },
    });

    if (syncQueue) {
      await syncQueue.add('sync', { sourceId: source.id, syncRunId: run.id }, { removeOnComplete: 100 });
      return { syncRunId: run.id, queued: true };
    }

    // Inline sync fallback when Redis unavailable
    const result = await runInventorySync(source.id, run.id);
    return { syncRunId: run.id, queued: false, result };
  });

  app.post('/v1/inventory/sources/:id/import', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const source = await prisma.inventorySource.findUnique({
      where: { id },
      include: { dealership: true },
    });
    if (!source) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Source not found' } });
    }
    const role = roleInOrg(request.user!, source.dealership.organizationId);
    if (!role || !hasMinRole(role, 'admin')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'No access' } });
    }

    const body = z
      .object({
        content: z.string().min(1),
        contentType: z.enum(['csv', 'xml', 'html']).optional(),
      })
      .parse(request.body);

    const mapping = (source.config as { mapping?: Record<string, string> }).mapping;
    let items =
      (body.contentType ?? source.type) === 'xml'
        ? parseXmlInventory(body.content, mapping)
        : (body.contentType ?? source.type) === 'website' || body.contentType === 'html'
          ? parseWebsiteInventory(body.content, (source.config as { url?: string }).url ?? 'https://example.com')
          : parseCsvInventory(body.content, mapping);

    const run = await prisma.syncRun.create({
      data: { sourceId: source.id, status: 'running', startedAt: new Date() },
    });

    try {
      const stats = await upsertImportedVehicles({
        dealershipId: source.dealershipId,
        sourceId: source.id,
        items,
      });
      await prisma.syncRun.update({
        where: { id: run.id },
        data: { status: 'succeeded', finishedAt: new Date(), stats },
      });
      await prisma.inventorySource.update({
        where: { id: source.id },
        data: { lastSyncAt: new Date(), lastStatus: 'succeeded' },
      });
      return { syncRunId: run.id, stats, imported: items.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      await prisma.syncRun.update({
        where: { id: run.id },
        data: { status: 'failed', finishedAt: new Date(), error: message },
      });
      await prisma.inventorySource.update({
        where: { id: source.id },
        data: { lastStatus: 'failed' },
      });
      return reply.code(500).send({ error: { code: 'import_failed', message } });
    }
  });
}

