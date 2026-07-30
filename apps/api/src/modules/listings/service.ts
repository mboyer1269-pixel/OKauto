import type { ActorType, Listing, PrismaClient } from "@okauto/db";
import {
  AppError,
  NON_TERMINAL_LISTING_STATUSES,
  assertTransition,
  buildListingTitle,
  renderDescription,
  type CreateListingInput,
  type ListingTransitionInput,
} from "@okauto/shared";
import { notifyUserOrLeaders } from "../notifications/service.js";
import type { NotificationHub } from "../notifications/hub.js";
import { writeAudit } from "../../lib/audit.js";
import { incrementCounter } from "../../lib/metrics.js";

export interface ListingActor {
  type: Extract<ActorType, "USER" | "EXTENSION" | "SYSTEM">;
  userId: string | null;
  ip?: string | null;
}

const VEHICLE_LISTABLE_STATUSES = ["INGESTED", "ACTIVE", "PRICE_CHANGED"] as const;

export async function createListing(
  db: PrismaClient,
  hub: NotificationHub | null,
  params: { orgId: string; actor: ListingActor; input: CreateListingInput },
): Promise<Listing> {
  const { orgId, actor, input } = params;

  const vehicle = await db.vehicle.findFirst({ where: { id: input.vehicleId, orgId } });
  if (!vehicle) throw AppError.notFound("Vehicle not found");
  if (!(VEHICLE_LISTABLE_STATUSES as readonly string[]).includes(vehicle.status)) {
    throw AppError.validation(`Vehicle with status ${vehicle.status} cannot be listed`, {
      status: vehicle.status,
    });
  }

  if (input.assigneeId) {
    const membership = await db.membership.findUnique({
      where: { userId_orgId: { userId: input.assigneeId, orgId } },
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw AppError.validation("Assignee is not an active member of this organization");
    }
  }

  const existing = await db.listing.findFirst({
    where: {
      vehicleId: vehicle.id,
      channel: input.channel,
      status: { in: [...NON_TERMINAL_LISTING_STATUSES] },
    },
  });
  if (existing) {
    throw AppError.conflict("Vehicle already has an active listing on this channel", {
      listingId: existing.id,
      status: existing.status,
    });
  }

  let description = input.description ?? vehicle.description;
  if (!description) {
    const org = await db.organization.findUniqueOrThrow({
      where: { id: orgId },
      include: { templates: { where: { isDefault: true }, take: 1 } },
    });
    const settings = (org.settings ?? {}) as { dealerContact?: string; descriptionFooter?: string };
    description = renderDescription({
      vehicle,
      template: org.templates[0]?.body ?? null,
      dealerName: org.name,
      dealerContact: settings.dealerContact ?? null,
      footer: settings.descriptionFooter ?? null,
    }).text;
  }

  const listing = await db.$transaction(async (tx) => {
    const created = await tx.listing.create({
      data: {
        orgId,
        vehicleId: vehicle.id,
        channel: input.channel,
        status: "DRAFT",
        title: input.title ?? buildListingTitle(vehicle),
        description,
        priceCents: vehicle.priceCents,
        currency: vehicle.currency,
        assigneeId: input.assigneeId ?? null,
        createdById: actor.userId,
      },
    });
    await tx.listingEvent.create({
      data: {
        listingId: created.id,
        actorType: actor.type,
        actorUserId: actor.userId,
        toStatus: "DRAFT",
        note: "Listing created",
      },
    });
    await writeAudit(tx, {
      orgId,
      actorType: actor.type,
      actorUserId: actor.userId,
      action: "LISTING_CREATED",
      entityType: "Listing",
      entityId: created.id,
      meta: { vehicleId: vehicle.id, channel: input.channel },
      ip: actor.ip,
    });
    return created;
  });

  incrementCounter("okauto_listings_created_total", { channel: input.channel });
  void hub;
  return listing;
}

export interface TransitionResult {
  listing: Listing;
}

export async function transitionListing(
  db: PrismaClient,
  hub: NotificationHub | null,
  params: {
    orgId: string;
    listingId: string;
    actor: ListingActor;
    input: ListingTransitionInput;
    /** Whether the actor may transition listings assigned to others. */
    canTransitionAll: boolean;
  },
): Promise<TransitionResult> {
  const { orgId, listingId, actor, input } = params;

  const listing = await db.listing.findFirst({
    where: { id: listingId, orgId },
    include: { vehicle: true },
  });
  if (!listing) throw AppError.notFound("Listing not found");

  if (!params.canTransitionAll && listing.assigneeId !== actor.userId && listing.createdById !== actor.userId) {
    throw AppError.forbidden("You can only transition listings assigned to you");
  }

  try {
    assertTransition(listing.status, input.to);
  } catch (err) {
    throw AppError.invalidTransition((err as Error).message);
  }

  const now = new Date();
  const updated = await db.$transaction(async (tx) => {
    const data: Record<string, unknown> = { status: input.to };
    if (input.to === "LIVE") {
      data.postedAt = now;
      data.externalUrl = input.externalUrl ?? listing.externalUrl;
      data.failureReason = null;
    }
    if (input.to === "REMOVED") data.removedAt = now;
    if (input.to === "ATTENTION") data.failureReason = input.failureReason ?? input.note ?? "Needs attention";
    if (input.to === "QUEUED") data.failureReason = null;
    if (input.externalUrl) data.externalUrl = input.externalUrl;

    const next = await tx.listing.update({ where: { id: listing.id }, data });
    await tx.listingEvent.create({
      data: {
        listingId: listing.id,
        actorType: actor.type,
        actorUserId: actor.userId,
        fromStatus: listing.status,
        toStatus: input.to,
        note: input.note ?? input.failureReason ?? null,
        meta: input.externalUrl ? { externalUrl: input.externalUrl } : undefined,
      },
    });

    // Confirm-sold flow: removing the listing of a suspected-sold vehicle confirms the sale.
    if (input.to === "REMOVED" && listing.vehicle.status === "SUSPECTED_SOLD") {
      await tx.vehicle.update({
        where: { id: listing.vehicleId },
        data: { status: "SOLD", soldAt: now },
      });
      await notifyUserOrLeaders(tx, hub, {
        orgId,
        userId: listing.assigneeId ?? listing.createdById,
        type: "SOLD_CONFIRMED",
        title: `Sale confirmed: ${listing.title}`,
        body: "The listing was removed and the vehicle is marked SOLD. Nice work.",
        data: { vehicleId: listing.vehicleId, listingId: listing.id },
      });
    }

    if (input.to === "LIVE") {
      await notifyUserOrLeaders(tx, hub, {
        orgId,
        userId: listing.assigneeId ?? listing.createdById,
        type: "LISTING_LIVE",
        title: `Listing live: ${listing.title}`,
        body: input.externalUrl ? `Published at ${input.externalUrl}` : "Marked live.",
        data: { listingId: listing.id, externalUrl: input.externalUrl ?? null },
      });
    }

    if (input.to === "ATTENTION") {
      await notifyUserOrLeaders(tx, hub, {
        orgId,
        userId: listing.assigneeId ?? listing.createdById,
        type: "LISTING_ATTENTION",
        title: `Listing needs attention: ${listing.title}`,
        body: (input.failureReason ?? input.note ?? "Review and re-queue.") + "",
        data: { listingId: listing.id, vehicleId: listing.vehicleId },
      });
    }

    await writeAudit(tx, {
      orgId,
      actorType: actor.type,
      actorUserId: actor.userId,
      action: "LISTING_TRANSITION",
      entityType: "Listing",
      entityId: listing.id,
      meta: { from: listing.status, to: input.to, externalUrl: input.externalUrl ?? null },
      ip: actor.ip,
    });

    return next;
  });

  incrementCounter("okauto_listing_transitions_total", { to: input.to });
  return { listing: updated };
}

/** Marks a vehicle SOLD and routes its listings appropriately. */
export async function markVehicleSold(
  db: PrismaClient,
  hub: NotificationHub | null,
  params: { orgId: string; vehicleId: string; actor: ListingActor; note?: string },
): Promise<void> {
  const { orgId, vehicleId, actor } = params;
  const vehicle = await db.vehicle.findFirst({ where: { id: vehicleId, orgId } });
  if (!vehicle) throw AppError.notFound("Vehicle not found");

  await db.$transaction(async (tx) => {
    await tx.vehicle.update({
      where: { id: vehicleId },
      data: { status: "SOLD", soldAt: new Date() },
    });
    const listings = await tx.listing.findMany({
      where: { vehicleId, status: { in: [...NON_TERMINAL_LISTING_STATUSES] } },
    });
    for (const listing of listings) {
      const to = listing.status === "LIVE" || listing.status === "NEEDS_REMOVAL" ? "NEEDS_REMOVAL" : "ENDED";
      if (listing.status === to) continue;
      await tx.listing.update({ where: { id: listing.id }, data: { status: to, removedAt: to === "ENDED" ? new Date() : null } });
      await tx.listingEvent.create({
        data: {
          listingId: listing.id,
          actorType: actor.type,
          actorUserId: actor.userId,
          fromStatus: listing.status,
          toStatus: to,
          note: params.note ?? "Vehicle marked sold",
        },
      });
    }
    await notifyUserOrLeaders(tx, hub, {
      orgId,
      userId: actor.userId,
      type: "SOLD_CONFIRMED",
      title: `Marked sold: ${vehicle.year ?? ""} ${vehicle.make} ${vehicle.model}`.replace(/\s+/g, " ").trim(),
      body: "Vehicle marked SOLD. Remove any live Marketplace listings.",
      data: { vehicleId },
    });
    await writeAudit(tx, {
      orgId,
      actorType: actor.type,
      actorUserId: actor.userId,
      action: "VEHICLE_MARKED_SOLD",
      entityType: "Vehicle",
      entityId: vehicleId,
      ip: actor.ip,
    });
  });
  incrementCounter("okauto_vehicles_marked_sold_total");
}
