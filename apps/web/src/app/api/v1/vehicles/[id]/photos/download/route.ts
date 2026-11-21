import { NextResponse } from 'next/server';
import { prisma } from '@okauto/database';
import { ApiErrorCode } from '@okauto/shared';
import { withAuth, apiError } from '@/lib/api';
import {
  fetchPublicImage,
  isPrivateHostname,
  PUBLIC_IMAGE_EXTENSIONS,
} from '@/lib/fetch-public-image';

export const GET = withAuth(async (request, { auth, params }) => {
  const requestUrl = new URL(request.url);
  const photoId = requestUrl.searchParams.get('photoId');
  const parsedIndex = Number.parseInt(requestUrl.searchParams.get('index') ?? '0', 10);
  const index = Number.isFinite(parsedIndex) && parsedIndex >= 0 ? parsedIndex : 0;

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: params!.id, organizationId: auth.orgId },
    select: {
      id: true,
      stockNumber: true,
      photos: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, url: true },
      },
    },
  });

  if (!vehicle) return apiError(ApiErrorCode.VEHICLE_NOT_FOUND, 404);
  const position = photoId === null ? index : vehicle.photos.findIndex((entry) => entry.id === photoId);
  const photo = vehicle.photos[position];
  if (!photo) return apiError(ApiErrorCode.PHOTO_NOT_FOUND, 404);

  const photoUrl = new URL(photo.url);
  if (photoUrl.protocol !== 'https:' || isPrivateHostname(photoUrl.hostname)) {
    return apiError(ApiErrorCode.INSECURE_PHOTO_URL, 400);
  }

  const upstream = await fetchPublicImage(photoUrl, AbortSignal.any([request.signal, AbortSignal.timeout(12000)])).catch(() => undefined);
  if (upstream === undefined) return apiError(ApiErrorCode.PHOTO_UNAVAILABLE, 502);
  if (!upstream) return apiError(ApiErrorCode.INSECURE_PHOTO_URL, 400);
  if (!upstream.ok) return apiError(ApiErrorCode.PHOTO_UNAVAILABLE, 502);

  const contentType = upstream.headers.get('content-type')?.split(';')[0].toLowerCase() ?? '';
  const extension = PUBLIC_IMAGE_EXTENSIONS[contentType];
  if (!extension) return apiError(ApiErrorCode.UNSUPPORTED_PHOTO_FORMAT, 415);

  const safeStock = (vehicle.stockNumber ?? vehicle.id).replace(/[^a-z0-9_-]+/gi, '-');
  const filename = `${safeStock}-photo-${position + 1}.${extension}`;

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
