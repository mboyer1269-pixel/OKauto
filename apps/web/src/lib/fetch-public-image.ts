export const PUBLIC_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/pjpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
};

export function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".local")) return true;
  if (normalized === "::1" || normalized === "[::1]") return true;

  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet)))
    return false;
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

export async function fetchPublicImage(startUrl: URL) {
  let current = startUrl;
  for (let hop = 0; hop < 5; hop += 1) {
    if (current.protocol !== "https:" || isPrivateHostname(current.hostname)) {
      return null;
    }
    const upstream = await fetch(current, {
      headers: {
        Accept:
          "image/avif,image/webp,image/png,image/jpeg,image/heic,image/heif,*/*",
        "User-Agent": "Mozilla/5.0 OKauto/1.0",
      },
      redirect: "manual",
      cache: "no-store",
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (!location) return upstream;
      current = new URL(location, current);
      continue;
    }
    return upstream;
  }
  return null;
}
