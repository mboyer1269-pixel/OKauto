import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@okauto/database';
import { ApiErrorCode } from '@okauto/shared';
import { onSaleInventoryWhere } from '@/lib/on-sale-query';
import { apiError, handleApiError } from '@/lib/api';
import { authenticateExtensionApiKey } from '@/lib/extension-auth';
import {
  fetchPublicImage,
  isPrivateHostname,
  PUBLIC_IMAGE_EXTENSIONS,
} from '@/lib/fetch-public-image';

export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ vehicleId: string }> }
) {
  try {
    const authResult = await authenticateExtensionApiKey(
      request.headers.get('x-api-key'),
    );
    if (!authResult.ok) return authResult.response;
    const auth = authResult.auth;

    const { vehicleId } = await segmentData.params;
    const parsedIndex = Number.parseInt(new URL(request.url).searchParams.get('index') ?? '0', 10);
    const index = Number.isFinite(parsedIndex) && parsedIndex >= 0 ? parsedIndex : 0;
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        organizationId: auth.orgId,
        AND: [{ id: vehicleId }, await onSaleInventoryWhere(auth.orgId)],
      },
      select: {
        id: true,
        stockNumber: true,
        photos: { orderBy: { sortOrder: 'asc' }, select: { url: true } },
      },
    });

    if (!vehicle) return apiError(ApiErrorCode.VEHICLE_NOT_FOUND, 404);
    const photo = vehicle.photos[index];
    if (!photo) return apiError(ApiErrorCode.PHOTO_NOT_FOUND, 404);

    const photoUrl = new URL(photo.url);
    if (photoUrl.protocol !== 'https:' || isPrivateHostname(photoUrl.hostname)) {
      return apiError(ApiErrorCode.INSECURE_PHOTO_URL, 400);
    }

    const upstream = await fetchPublicImage(photoUrl);
    if (!upstream) return apiError(ApiErrorCode.INSECURE_PHOTO_URL, 400);
    if (!upstream.ok) return apiError(ApiErrorCode.PHOTO_UNAVAILABLE, 502);

    const contentType = upstream.headers.get('content-type')?.split(';')[0].toLowerCase() ?? '';
    const extension = PUBLIC_IMAGE_EXTENSIONS[contentType];
    if (!extension) return apiError(ApiErrorCode.UNSUPPORTED_PHOTO_FORMAT, 415);

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
