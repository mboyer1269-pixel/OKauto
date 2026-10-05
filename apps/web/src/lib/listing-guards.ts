import { Prisma, prisma } from "@okauto/database";
import {
  remainingListingSlots,
  resolveMonthlyListingLimit,
  startOfCalendarMonth,
} from "@okauto/shared";

export class ListingGuardError extends Error {
  status: number;
  extra: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ListingGuardError";
    this.status = status;
    this.extra = extra;
  }
}

type Tx = Prisma.TransactionClient;

export type ListingCreateGuardContext = {
  organizationId: string;
  userId: string;
  vehicleId: string;
  platform: string;
};

export type ListingCreatePrepared = {
  ownActiveId: string | null;
};

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

async function lockListingCreateRows(
  tx: Tx,
  ctx: ListingCreateGuardContext,
): Promise<void> {
  // Vehicle first, then membership — consistent lock order to avoid deadlocks.
  const vehicleRows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "vehicles"
    WHERE id = ${ctx.vehicleId} AND "organizationId" = ${ctx.organizationId}
    FOR UPDATE
  `;
  if (vehicleRows.length === 0) {
    throw new ListingGuardError(404, "Véhicule introuvable");
  }

  const memberRows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "organization_members"
    WHERE "organizationId" = ${ctx.organizationId} AND "userId" = ${ctx.userId}
    FOR UPDATE
  `;
  if (memberRows.length === 0) {
    throw new ListingGuardError(403, "Accès insuffisant");
  }
}

async function prepareListingCreate(
  tx: Tx,
  ctx: ListingCreateGuardContext,
): Promise<ListingCreatePrepared> {
  await lockListingCreateRows(tx, ctx);

  const teamActive = await tx.listing.findFirst({
    where: {
      organizationId: ctx.organizationId,
      vehicleId: ctx.vehicleId,
      platform: ctx.platform,
      status: "ACTIVE",
    },
    include: { user: { select: { id: true, name: true } } },
  });

  if (teamActive) {
    if (teamActive.userId !== ctx.userId) {
      const publisher = teamActive.user.name || "un collègue";
      throw new ListingGuardError(
        409,
        `Une annonce active existe déjà pour ce véhicule (publiée par ${publisher}). Anti-doublon d'équipe.`,
        { listing: teamActive },
      );
    }
    return { ownActiveId: teamActive.id };
  }

  const [organization, membership, monthCount] = await Promise.all([
    tx.organization.findUnique({ where: { id: ctx.organizationId } }),
    tx.organizationMember.findFirst({
      where: { organizationId: ctx.organizationId, userId: ctx.userId },
    }),
    tx.listing.count({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        platform: ctx.platform,
        listedAt: { gte: startOfCalendarMonth() },
      },
    }),
  ]);

  const monthlyLimit = resolveMonthlyListingLimit({
    memberLimit: membership?.marketplaceMonthlyVehicleLimit,
    organizationMarketplaceLimit: organization?.marketplaceMonthlyVehicleLimit,
    organizationMonthlyLimit: organization?.monthlyListingLimit,
  });

  if (remainingListingSlots(monthCount, monthlyLimit) <= 0) {
    throw new ListingGuardError(
      409,
      `Quota mensuel atteint (${monthCount}/${monthlyLimit}). Attendez le mois prochain ou demandez une hausse à la direction.`,
    );
  }

  return { ownActiveId: null };
}

async function conflictFromUniqueIndex(
  ctx: ListingCreateGuardContext,
): Promise<ListingGuardError> {
  const existing = await prisma.listing.findFirst({
    where: {
      organizationId: ctx.organizationId,
      vehicleId: ctx.vehicleId,
      platform: ctx.platform,
      status: "ACTIVE",
    },
    include: { user: { select: { id: true, name: true } } },
  });
  if (existing && existing.userId !== ctx.userId) {
    const publisher = existing.user.name || "un collègue";
    return new ListingGuardError(
      409,
      `Une annonce active existe déjà pour ce véhicule (publiée par ${publisher}). Anti-doublon d'équipe.`,
      { listing: existing },
    );
  }
  return new ListingGuardError(
    409,
    "An active listing already exists for this vehicle and platform",
    existing ? { listing: existing } : {},
  );
}

export async function withListingCreateLock<T>(
  ctx: ListingCreateGuardContext,
  fn: (tx: Tx, prepared: ListingCreatePrepared) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const prepared = await prepareListingCreate(tx, ctx);
        return fn(tx, prepared);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  } catch (err) {
    if (err instanceof ListingGuardError) throw err;
    if (isUniqueViolation(err)) {
      throw await conflictFromUniqueIndex(ctx);
    }
    throw err;
  }
}
