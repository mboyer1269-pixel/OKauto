export interface QueueVehicle {
  id: string;
  vin: string | null;
  stockNumber: string | null;
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
  priceCents: number;
  currency: string;
  condition: string;
  bodyStyle: string | null;
  fuelType: string | null;
  transmission: string | null;
  exteriorColor: string | null;
  description: string | null;
  photos: { id: string; url: string; position: number }[];
}

export interface QueueListing {
  id: string;
  status: string;
  title: string;
  description: string | null;
  priceCents: number | null;
  channel: string;
  vehicle: QueueVehicle;
}

export interface PingResult {
  ok: boolean;
  serverTime: string;
  user: { id: string; email: string; name: string };
  org: { id: string; name: string; slug: string };
  role: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Thin fetch wrapper for the OKauto API using an extension PAT. */
export class OkAutoApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly pat: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl.replace(/\/$/, "")}/api/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.pat}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let code = "UNKNOWN";
      let message = `Request failed (${res.status})`;
      try {
        const json = (await res.json()) as { error?: { code?: string; message?: string } };
        code = json.error?.code ?? code;
        message = json.error?.message ?? message;
      } catch {
        // keep defaults
      }
      throw new ApiError(res.status, code, message);
    }
    return (await res.json()) as T;
  }

  ping(): Promise<PingResult> {
    return this.request("GET", "/extension/ping");
  }

  myQueue(): Promise<{ items: QueueListing[] }> {
    return this.request("GET", "/listings/queue/mine");
  }

  transition(
    listingId: string,
    input: { to: string; note?: string; externalUrl?: string; failureReason?: string },
  ): Promise<{ listing: QueueListing }> {
    return this.request("POST", `/listings/${listingId}/transition`, input);
  }
}
