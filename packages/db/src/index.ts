import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import {
  buildListingTitle,
  buildMarketplaceDescription,
  canonicalizeUrl,
  normalizeCapturePayload,
  vehicleIdentityKey,
  type CapturePayload
} from "@okauto/shared";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function verifyToken(candidate: string, expectedHash: string): boolean {
  const candidateHash = Buffer.from(hashToken(candidate), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return candidateHash.length === expected.length && timingSafeEqual(candidateHash, expected);
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, encodedHash: string | null | undefined): boolean {
  if (!encodedHash) {
    return false;
  }

  const [algorithm, salt, expectedHash] = encodedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHash) {
    return false;
  }

  const candidate = Buffer.from(scryptSync(password, salt, 64).toString("hex"), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export async function resolveExtensionCredential(token: string) {
  const tokenHash = hashToken(token);
  const credential = await prisma.extensionCredential.findUnique({
    where: { tokenHash },
    include: { organization: { include: { dealerships: true } } }
  });

  if (!credential || credential.revokedAt) {
    return null;
  }

  await prisma.extensionCredential.update({
    where: { id: credential.id },
    data: { lastUsedAt: new Date() }
  });

  return credential;
}

export async function ingestCapture(
  organizationId: string,
  fallbackDealershipId: string,
  payload: CapturePayload
) {
  const normalized = normalizeCapturePayload(payload);
  const dealershipId = normalized.dealershipId ?? fallbackDealershipId;
  const identityKey = vehicleIdentityKey(normalized.vehicle);
  const sourceUrl = canonicalizeUrl(normalized.sourceUrl);

  const source = await prisma.inventorySource.upsert({
    where: {
      id: `extension-${dealershipId}`
    },
    update: {
      enabled: true,
      url: new URL(sourceUrl).origin
    },
    create: {
      id: `extension-${dealershipId}`,
      organizationId,
      dealershipId,
      type: "EXTENSION",
      name: "Chrome extension captures",
      url: new URL(sourceUrl).origin
    }
  });

  const existing = normalized.vehicle.vin
    ? await prisma.vehicle.findFirst({
        where: { organizationId, vin: normalized.vehicle.vin }
      })
    : await prisma.vehicle.findFirst({
        where: { organizationId, sourceUrl }
      });

  const vehicleData: Prisma.VehicleUncheckedCreateInput = {
    organizationId,
    dealershipId,
    sourceId: source.id,
    vin: normalized.vehicle.vin,
    stockNumber: normalized.vehicle.stockNumber,
    year: normalized.vehicle.year,
    make: normalized.vehicle.make,
    model: normalized.vehicle.model,
    trim: normalized.vehicle.trim,
    bodyStyle: normalized.vehicle.bodyStyle,
    drivetrain: normalized.vehicle.drivetrain,
    transmission: normalized.vehicle.transmission,
    fuelType: normalized.vehicle.fuelType,
    exteriorColor: normalized.vehicle.exteriorColor,
    interiorColor: normalized.vehicle.interiorColor,
    mileage: normalized.vehicle.mileage,
    price: normalized.vehicle.price,
    status: normalized.vehicle.status,
    location: normalized.vehicle.location,
    features: normalized.vehicle.features,
    notes: normalized.vehicle.notes,
    identityKey,
    sourceUrl
  };

  const vehicle = existing
    ? await prisma.vehicle.update({
        where: { id: existing.id },
        data: vehicleData
      })
    : await prisma.vehicle.create({ data: vehicleData });

  if (normalized.photos.length > 0) {
    await prisma.vehicleMedia.createMany({
      data: normalized.photos.map((url, index) => ({
        vehicleId: vehicle.id,
        url,
        sortOrder: index,
        source: "EXTENSION" as const
      })),
      skipDuplicates: true
    });
  }

  const title = buildListingTitle(normalized.vehicle);
  const description = buildMarketplaceDescription(normalized.vehicle);
  const listing =
    (await prisma.listing.findFirst({
      where: {
        organizationId,
        vehicleId: vehicle.id,
        status: { in: ["DRAFT", "READY", "POSTED", "PRICE_CHANGE", "SOLD_ALERT"] }
      }
    })) ??
    (await prisma.listing.create({
      data: {
        organizationId,
        vehicleId: vehicle.id,
        title,
        description,
        price: normalized.vehicle.price,
        location: normalized.vehicle.location,
        status: "READY",
        snapshots: {
          create: {
            status: "READY",
            price: normalized.vehicle.price,
            notes: "Created from extension capture."
          }
        }
      }
    }));

  await prisma.activityEvent.create({
    data: {
      organizationId,
      vehicleId: vehicle.id,
      listingId: listing.id,
      action: existing ? "extension_capture_updated_vehicle" : "extension_capture_created_vehicle",
      metadata: {
        sourceUrl,
        adapterVersion: normalized.adapterVersion
      }
    }
  });

  return {
    vehicleId: vehicle.id,
    listingId: listing.id,
    duplicate: Boolean(existing),
    nextAction: "review_listing" as const
  };
}
