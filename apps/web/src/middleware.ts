import { NextResponse, type NextRequest } from 'next/server';

/**
 * CORS for the API. The Chrome extension (chrome-extension://<id>) and the dashboard
 * origin call /api/v1. We reflect allowed origins and handle preflight. Credentials are
 * only used by same-origin dashboard requests; the extension uses bearer tokens.
 */
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (origin.startsWith('chrome-extension://')) return true;
  if (origin.startsWith('moz-extension://')) return true;
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
  } catch {
    return false;
  }
  const configured = (process.env.API_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return configured.includes(origin);
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin');
  const allowed = isAllowedOrigin(origin);

  if (req.method === 'OPTIONS') {
    const res = new NextResponse(null, { status: 204 });
    if (allowed && origin) applyCors(res, origin);
    return res;
  }

  const res = NextResponse.next();
  if (allowed && origin) applyCors(res, origin);
  return res;
}

function applyCors(res: NextResponse, origin: string): void {
  res.headers.set('Access-Control-Allow-Origin', origin);
  res.headers.set('Vary', 'Origin');
  res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.headers.set('Access-Control-Allow-Credentials', 'true');
  res.headers.set('Access-Control-Max-Age', '86400');
}

export const config = {
  matcher: ['/api/:path*'],
};
