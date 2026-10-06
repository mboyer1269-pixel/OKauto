import { syncFetchLimits } from "@okauto/shared";

export interface LimitedTextResponse {
  body: string;
  contentType: string | null;
  url: string;
  status: number;
}

export async function fetchTextLimited(
  url: string,
  init: {
    headers?: HeadersInit;
    redirect?: RequestRedirect;
    timeoutMs?: number;
    maxBytes?: number;
  } = {},
): Promise<LimitedTextResponse> {
  const defaults = syncFetchLimits();
  const timeoutMs = init.timeoutMs ?? defaults.timeoutMs;
  const maxBytes = init.maxBytes ?? defaults.maxBytes;
  const response = await fetch(url, {
    headers: init.headers,
    redirect: init.redirect ?? "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get("content-type");
  const announced = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(announced) && announced > maxBytes) {
    throw new Error(`response exceeded ${maxBytes} bytes`);
  }

  const body = response.body;
  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error(`response exceeded ${maxBytes} bytes`);
        }
        chunks.push(value);
      }
    }
    const merged = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    return {
      body: merged.toString("utf8"),
      contentType,
      url: response.url || url,
      status: response.status,
    };
  }

  const text = await response.text();
  if (Buffer.byteLength(text) > maxBytes) {
    throw new Error(`response exceeded ${maxBytes} bytes`);
  }
  return {
    body: text,
    contentType,
    url: response.url || url,
    status: response.status,
  };
}
