import { vehicleTitle, type ListingStatus } from "@lotpilot/core";
import { prisma, type Listing } from "@lotpilot/db";
import { badRequest, conflict, notFound } from "./api";

/** Legal listing status transitions (human-in-the-loop lifecycle). */
const TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  DRAFT: ["PREPARED", "ERROR"],
  PREPARED: ["POSTED", "DRAFT", "ERROR"],
  POSTED: ["DELIST_REQUESTED", "DELISTED", "ERROR"],
  DELIST_REQUESTED: ["DELISTED", "POSTED", "ERROR"],
  DELISTED: [],
  ERROR: ["DRAFT", "PREPARED"],
};

export interface CreateListingArgs {
  organizationId: string;
  vehicleId: string;
  userId: string;
  /** Proceed even when a teammate already has an active listing for this vehicle. */
  force?: boolean;
}

export interface CreateListingResult {
  listing: Listing;
  duplicateWarning: string | null;
}

export async function createListing(args: CreateListingArgs): Promise<CreateListingResult> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: args.vehicleId, organizationId: args.organizationId },
  });
  if (!vehicle) throw notFound("Vehicle not found");
  if (vehicle.status !== "AVAILABLE") {
    throw badRequest(`This vehicle is ${vehicle.status.toLowerCase()} and cannot be listed`);
  }

  const mine = await prisma.listing.findFirst({
    where: {
      vehicleId: args.vehicleId,
      userId: args.userId,
      status: { in: ["DRAFT", "PREPARED", "POSTED", "DELIST_REQUESTED"] },
    },
  });
  if (mine) throw conflict("You already have an active listing for this vehicle");

  const teammate = await prisma.listing.findFirst({
    where: {
      vehicleId: args.vehicleId,
      status: { in: ["PREPARED", "POSTED"] },
      userId: { not: args.userId },
    },
    include: { user: { select: { name: true } } },
  });
  let duplicateWarning: string | null = null;
  if (teammate) {
    duplicateWarning = `${teammate.user.name} already has an active listing for this vehicle.`;
    if (!args.force) {
      throw conflict(`${duplicateWarning} Pass force=true to list it anyway.`);
    }
  }

  const listing = await prisma.listing.create({
    data: {
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
      userId: args.userId,
      status: "DRAFT",
      titleSnapshot: vehicleTitle(vehicle),
      priceSnapshotCents: vehicle.priceCents,
      events: { create: { actorId: args.userId, type: "CREATED", data: {} } },
    },
  });
  return { listing, duplicateWarning };
}

export interface TransitionArgs {
  listingId: string;
  organizationId: string;
  actorId: string;
  /** When set, only listings owned by this user can be transitioned. */
  restrictToUserId?: string;
  status: ListingStatus;
  externalUrl?: string | null;
  errorMessage?: string | null;
}

export async function transitionListing(args: TransitionArgs): Promise<Listing> {
  const listing = await prisma.listing.findFirst({
    where: { id: args.listingId, organizationId: args.organizationId },
  });
  if (!listing) throw notFound("Listing not found");
  if (args.restrictToUserId && listing.userId !== args.restrictToUserId) {
    throw notFound("Listing not found");
  }
  const allowed = TRANSITIONS[listing.status as ListingStatus] ?? [];
  if (!allowed.includes(args.status)) {
    throw badRequest(`Cannot move a ${listing.status} listing to ${args.status}`);
  }
  if (args.status === "POSTED" && !args.externalUrl && !listing.externalUrl) {
    throw badRequest("Provide the Facebook Marketplace listing URL when marking as posted");
  }
  if (args.externalUrl && !/^https:\/\/(www\.)?facebook\.com\//.test(args.externalUrl)) {
    throw badRequest("externalUrl must be a facebook.com listing URL");
  }

  const now = new Date();
  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data: {
      status: args.status,
      externalUrl: args.externalUrl ?? undefined,
      errorMessage: args.status === "ERROR" ? (args.errorMessage ?? "Unknown error") : null,
      preparedAt: args.status === "PREPARED" ? now : undefined,
      postedAt: args.status === "POSTED" ? now : undefined,
      delistedAt: args.status === "DELISTED" ? now : undefined,
      events: {
        create: {
          actorId: args.actorId,
          type: args.status,
          data: JSON.parse(
            JSON.stringify({
              externalUrl: args.externalUrl ?? undefined,
              error: args.errorMessage ?? undefined,
            }),
          ),
        },
      },
    },
  });
  return updated;
}
