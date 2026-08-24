import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@okauto/database';
import { authenticateApiKey } from '@/lib/auth';
import { errorResponse, handleApiError } from '@/lib/api';

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized.endsWith('.local')) return true;
  if (normalized === '::1' || normalized === '[::1]') return true;

  const octets = normalized.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return false;
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ vehicleId: string }> }
) {
  try {
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) return errorResponse('API key required', 401);

    const auth = await authenticateApiKey(apiKey);
    if (!auth) return errorResponse('Invalid API key', 401);

    const { vehicleId } = await segmentData.params;
    const parsedIndex = Number.parseInt(new URL(request.url).searchParams.get('index') ?? '0', 10);
    const index = Number.isFinite(parsedIndex) && parsedIndex >= 0 ? parsedIndex : 0;
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: auth.orgId },
      select: {
        id: true,
        stockNumber: true,
        photos: { orderBy: { sortOrder: 'asc' }, select: { url: true } },
      },
    });

    if (!vehicle) return errorResponse('Vehicle not found', 404);
    const photo = vehicle.photos[index];
    if (!photo) return errorResponse('Photo not found', 404);

    const photoUrl = new URL(photo.url);
    if (photoUrl.protocol !== 'https:' || isPrivateHostname(photoUrl.hostname)) {
      return errorResponse('Only secure vehicle photos can be downloaded', 400);
    }

    const upstream = await fetch(photoUrl, {
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*',
        'User-Agent': 'Mozilla/5.0 OKauto/1.0',
      },
      redirect: 'error',
      cache: 'no-store',
    });
    if (!upstream.ok) return errorResponse('Vehicle photo is temporarily unavailable', 502);

    const contentType = upstream.headers.get('content-type')?.split(';')[0].toLowerCase() ?? '';
    const extension = IMAGE_EXTENSIONS[contentType];
    if (!extension) return errorResponse('Unsupported vehicle photo format', 415);

    const safeStock = (vehicle.stockNumber ?? vehicle.id).replace(/[^a-z0-9_-]+/gi, '-');
    const filename = `${safeStock}-photo-${index + 1}.${extension}`;
    return new NextResponse(await upstream.arrayBuffer(), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-OKauto-Filename': filename,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
