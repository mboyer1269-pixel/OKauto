import IORedis from "ioredis";
import { NextResponse } from "next/server";
import { getClientIp } from "./client-ip";

export const AUTH_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  maxFailuresPerAccount: 5,
  maxFailuresPerIp: 20,
} as const;

export type AuthRateLimitAction = "login" | "register";

export interface RateLimitCounter {
  count: number;
  ttlSeconds: number;
}

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<number>;
  get(key: string): Promise<RateLimitCounter>;
  reset(key: string): Promise<void>;
}

const INCR_EXPIRE_LUA = `
local n = redis.call("INCR", KEYS[1])
if n == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
return n
`;

type MemoryEntry = { count: number; expiresAt: number };

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, MemoryEntry>();

  async increment(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const current = this.entries.get(key);
    if (!current || current.expiresAt <= now) {
      this.entries.set(key, { count: 1, expiresAt: now + windowMs });
      return 1;
    }
    current.count += 1;
    return current.count;
  }

  async get(key: string): Promise<RateLimitCounter> {
    const now = Date.now();
    const current = this.entries.get(key);
    if (!current || current.expiresAt <= now) {
      if (current) this.entries.delete(key);
      return { count: 0, ttlSeconds: 0 };
    }
    return {
      count: current.count,
      ttlSeconds: Math.max(1, Math.ceil((current.expiresAt - now) / 1000)),
    };
  }

  async reset(key: string): Promise<void> {
    this.entries.delete(key);
  }
}

class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: IORedis) {}

  async increment(key: string, windowMs: number): Promise<number> {
    const result = await this.redis.eval(
      INCR_EXPIRE_LUA,
      1,
      key,
      String(windowMs),
    );
    return Number(result);
  }

  async get(key: string): Promise<RateLimitCounter> {
    const [count, ttl] = await Promise.all([
      this.redis.get(key),
      this.redis.ttl(key),
    ]);
    return {
      count: count ? Number(count) : 0,
      ttlSeconds: ttl > 0 ? ttl : 0,
    };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

class FallbackRateLimitStore implements RateLimitStore {
  constructor(
    private readonly primary: RateLimitStore,
    private readonly fallback: RateLimitStore,
  ) {}

  async increment(key: string, windowMs: number): Promise<number> {
    try {
      return await this.primary.increment(key, windowMs);
    } catch (error) {
      warnRedisUnavailable(error);
      markMemoryOnly();
      return this.fallback.increment(key, windowMs);
    }
  }

  async get(key: string): Promise<RateLimitCounter> {
    try {
      return await this.primary.get(key);
    } catch (error) {
      warnRedisUnavailable(error);
      markMemoryOnly();
      return this.fallback.get(key);
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await this.primary.reset(key);
    } catch (error) {
      warnRedisUnavailable(error);
      markMemoryOnly();
      await this.fallback.reset(key);
    }
  }
}

let injectedStore: RateLimitStore | null = null;
let memoryStore: MemoryRateLimitStore | null = null;
let redisClient: IORedis | null = null;
let memoryOnly = false;
let redisWarningLogged = false;

function windowSeconds(): number {
  return Math.ceil(AUTH_RATE_LIMIT.windowMs / 1000);
}

function warnRedisUnavailable(error: unknown) {
  if (redisWarningLogged) return;
  redisWarningLogged = true;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    "[rate-limit] Redis indisponible, repli sur un compteur en mémoire:",
    message,
  );
}

function markMemoryOnly() {
  memoryOnly = true;
}

function getMemoryStore(): MemoryRateLimitStore {
  if (!memoryStore) memoryStore = new MemoryRateLimitStore();
  return memoryStore;
}

function getRedisClient(): IORedis {
  if (!redisClient) {
    redisClient = new IORedis(
      process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
      {
        maxRetriesPerRequest: 1,
        connectTimeout: 400,
        enableOfflineQueue: false,
        lazyConnect: true,
      },
    );
    redisClient.on("error", (error) => {
      warnRedisUnavailable(error);
    });
  }
  return redisClient;
}

async function getStore(): Promise<RateLimitStore> {
  if (injectedStore) return injectedStore;
  if (memoryOnly) return getMemoryStore();

  try {
    const client = getRedisClient();
    if (client.status === "wait") {
      await client.connect();
    }
    return new FallbackRateLimitStore(
      new RedisRateLimitStore(client),
      getMemoryStore(),
    );
  } catch (error) {
    warnRedisUnavailable(error);
    markMemoryOnly();
    return getMemoryStore();
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase("fr-CA");
}

function ipKey(action: AuthRateLimitAction, ip: string): string {
  return `auth-rl:${action}:ip:${ip}`;
}

function accountKey(action: AuthRateLimitAction, email: string): string {
  return `auth-rl:${action}:acct:${normalizeEmail(email)}`;
}

export function setAuthRateLimitStoreForTests(store: RateLimitStore | null) {
  injectedStore = store;
}

export async function checkAuthRateLimit(params: {
  ip: string;
  email?: string;
  action: AuthRateLimitAction;
}): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  try {
    const store = await getStore();
    const ipState = await store.get(ipKey(params.action, params.ip));
    if (ipState.count >= AUTH_RATE_LIMIT.maxFailuresPerIp) {
      return {
        allowed: false,
        retryAfterSeconds: ipState.ttlSeconds || windowSeconds(),
      };
    }
    if (params.email) {
      const accountState = await store.get(
        accountKey(params.action, params.email),
      );
      if (accountState.count >= AUTH_RATE_LIMIT.maxFailuresPerAccount) {
        return {
          allowed: false,
          retryAfterSeconds: accountState.ttlSeconds || windowSeconds(),
        };
      }
    }
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (error) {
    console.warn(
      "[rate-limit] Impossible de vérifier la limite, poursuite de la requête:",
      error instanceof Error ? error.message : error,
    );
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export async function recordAuthFailure(
  request: Request,
  action: AuthRateLimitAction,
  email?: string,
): Promise<void> {
  try {
    const store = await getStore();
    const ip = getClientIp(request);
    await store.increment(ipKey(action, ip), AUTH_RATE_LIMIT.windowMs);
    if (email) {
      await store.increment(
        accountKey(action, email),
        AUTH_RATE_LIMIT.windowMs,
      );
    }
  } catch (error) {
    console.warn(
      "[rate-limit] Impossible d'enregistrer l'échec, poursuite de la requête:",
      error instanceof Error ? error.message : error,
    );
  }
}

export async function clearAuthFailures(
  action: AuthRateLimitAction,
  email: string,
): Promise<void> {
  try {
    const store = await getStore();
    await store.reset(accountKey(action, email));
  } catch (error) {
    console.warn(
      "[rate-limit] Impossible de réinitialiser le compteur:",
      error instanceof Error ? error.message : error,
    );
  }
}

export async function enforceAuthRateLimit(
  request: Request,
  action: AuthRateLimitAction,
  email?: string,
) {
  const result = await checkAuthRateLimit({
    ip: getClientIp(request),
    email,
    action,
  });
  if (!result.allowed) {
    const response = NextResponse.json(
      { error: "Trop de tentatives. Réessayez plus tard." },
      { status: 429 },
    );
    response.headers.set(
      "Retry-After",
      String(Math.max(1, Math.ceil(result.retryAfterSeconds))),
    );
    return response;
  }
  return null;
}
