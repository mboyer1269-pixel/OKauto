import {
  buildVehicleTitle,
  templateDescription,
  type MarketplaceListingPayload,
} from '@okauto/shared';
import type { Vehicle, VehicleMedia } from '@prisma/client';
import { prisma } from '../db.js';
import type { Env } from '../config.js';

export async function generateDescription(
  env: Env,
  vehicle: Vehicle,
): Promise<{ text: string; provider: string; model?: string }> {
  const base = {
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    mileage: vehicle.mileage,
    price: vehicle.price ? Number(vehicle.price) : null,
    exteriorColor: vehicle.exteriorColor,
    stockNumber: vehicle.stockNumber,
    vin: vehicle.vin,
    description: vehicle.description,
  };

  if (!env.AI_ENABLED || !env.OPENAI_API_KEY) {
    const text = templateDescription(base);
    return { text, provider: 'template' };
  }

  try {
    const prompt = `Write a compliant Facebook Marketplace vehicle listing description (max 1200 characters). Be factual, no guarantees, no spammy ALL CAPS. Include year/make/model, key specs, and a soft CTA.\n\nData: ${JSON.stringify(base)}`;
    const res = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You write concise, truthful vehicle marketplace listings for dealerships.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 500,
      }),
    });
    if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty AI response');
    return { text, provider: 'openai', model: env.OPENAI_MODEL };
  } catch {
    return { text: templateDescription(base), provider: 'template-fallback' };
  }
}

export async function prepareListingPayload(input: {
  env: Env;
  vehicleId: string;
  salespersonId: string;
  regenerateDescription?: boolean;
  titleOverride?: string;
  priceOverride?: number;
  descriptionOverride?: string;
}): Promise<{ listingId: string; payload: MarketplaceListingPayload }> {
  const vehicle = await prisma.vehicle.findUniqueOrThrow({
    where: { id: input.vehicleId },
    include: { media: { orderBy: { sortOrder: 'asc' } }, dealership: true },
  });

  let description = input.descriptionOverride ?? vehicle.aiDescription ?? vehicle.description;
  if (!description || input.regenerateDescription) {
    const generated = await generateDescription(input.env, vehicle);
    description = generated.text;
    await prisma.descriptionGeneration.create({
      data: {
        vehicleId: vehicle.id,
        provider: generated.provider,
        model: generated.model,
        output: generated.text,
      },
    });
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { aiDescription: generated.text },
    });
  }

  const title =
    input.titleOverride ??
    buildVehicleTitle({
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
    });
  const price =
    input.priceOverride ?? (vehicle.price != null ? Number(vehicle.price) : null);

  const listing = await prisma.listing.create({
    data: {
      vehicleId: vehicle.id,
      dealershipId: vehicle.dealershipId,
      salespersonId: input.salespersonId,
      status: 'prepared',
      title,
      price: price ?? undefined,
      description,
      preparedPayload: {},
    },
  });

  const payload: MarketplaceListingPayload = {
    listingId: listing.id,
    vehicleId: vehicle.id,
    title,
    price,
    currency: vehicle.currency,
    description: description ?? '',
    condition: 'Used',
    vehicleType: vehicle.vehicleType,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    mileage: vehicle.mileage,
    vin: vehicle.vin,
    exteriorColor: vehicle.exteriorColor,
    photos: vehicle.media.map((m: VehicleMedia) => ({
      url: m.url,
      sortOrder: m.sortOrder,
    })),
    locationHint: [vehicle.dealership.city, vehicle.dealership.state].filter(Boolean).join(', ') || null,
    policyNotice:
      'OKauto assists listing creation. You must review and submit manually. Never bypass CAPTCHA or platform protections.',
  };

  await prisma.listing.update({
    where: { id: listing.id },
    data: { preparedPayload: payload },
  });

  await prisma.listingEvent.create({
    data: {
      listingId: listing.id,
      actorId: input.salespersonId,
      type: 'prepared',
      meta: { photoCount: payload.photos.length },
    },
  });

  if (vehicle.status === 'available') {
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { status: 'listed' },
    });
  }

  return { listingId: listing.id, payload };
}
