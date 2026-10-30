import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * A small in-memory fixed-window rate limiter, keyed by the authenticated
 * Firebase uid and falling back to the client IP for unauthenticated requests.
 *
 * Limits are per process. SHINE runs a single Node process behind the platform
 * proxy, so this is enough to stop a signed-in user (or a runaway client loop)
 * from hammering the AI, storage and safeguarding endpoints. If the server is
 * ever scaled horizontally each instance keeps its own window; move the store
 * to Firestore/Redis at that point.
 */

export interface RateLimitConfig {
  /** Human label used in logs and the client-facing message. */
  name: string;
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimiterOptions {
  /** Resolve the caller's uid (may be async). Falls back to the client IP when it returns undefined. */
  resolveUid?: (req: Request) => string | undefined | Promise<string | undefined>;
  /** Optional logger; defaults to console.warn. */
  onLimit?: (key: string, config: RateLimitConfig, retryAfterSeconds: number) => void;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  limit: number;
  remaining: number;
}

interface WindowState {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Map<string, WindowState>>();

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getClientKey(req: Request, uid?: string): string {
  if (uid) return `uid:${uid}`;
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
    || req.ip
    || req.socket?.remoteAddress
    || 'unknown';
  return `ip:${ip}`;
}

/** Pure check used by the middleware and by tests. Exposed for direct testing. */
export function checkRateLimit(
  config: RateLimitConfig,
  key: string,
  now: number = Date.now(),
): RateLimitResult {
  let bucket = buckets.get(config.name);
  if (!bucket) {
    bucket = new Map();
    buckets.set(config.name, bucket);
  }

  const current = bucket.get(key);
  if (!current || current.resetAt <= now) {
    bucket.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, retryAfterSeconds: 0, limit: config.limit, remaining: config.limit - 1 };
  }

  if (current.count >= config.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      limit: config.limit,
      remaining: 0,
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0, limit: config.limit, remaining: config.limit - current.count };
}

/** Clear a single key or a whole limiter. Used by tests. */
export function resetRateLimit(name?: string): void {
  if (name) buckets.delete(name);
  else buckets.clear();
}

export function createRateLimiter(config: RateLimitConfig, options: RateLimiterOptions = {}): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    let uid: string | undefined;
    try {
      uid = await options.resolveUid?.(req);
    } catch {
      // Authentication failed; the route itself will return the proper error.
      uid = undefined;
    }

    const key = getClientKey(req, uid);
    const result = checkRateLimit(config, key);
    res.setHeader('X-RateLimit-Limit', String(result.limit));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    if (result.allowed) {
      next();
      return;
    }

    res.setHeader('Retry-After', String(result.retryAfterSeconds));
    const message = `Too many ${config.name} requests. Please wait ${result.retryAfterSeconds} second${result.retryAfterSeconds === 1 ? '' : 's'} and try again.`;
    const logger = options.onLimit ?? ((limitedKey, limitedConfig, retryAfter) =>
      console.warn(`[rate-limit] ${limitedConfig.name} limit hit for ${limitedKey}; retry in ${retryAfter}s`));
    logger(key, config, result.retryAfterSeconds);

    // AI clients read `reply`; everything else reads `error`.
    res.status(429).json({ success: false, error: message, errorMessage: message, reply: message });
  };
}

/** Resolve the per-user limits from the environment (with safe defaults). */
export function getRateLimitConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    ai: {
      name: 'AI',
      limit: readPositiveInt(env.SHINE_AI_RATE_LIMIT, 20),
      windowMs: 60_000,
    } satisfies RateLimitConfig,
    storage: {
      name: 'storage',
      limit: readPositiveInt(env.SHINE_STORAGE_RATE_LIMIT, 60),
      windowMs: 60_000,
    } satisfies RateLimitConfig,
    safeguarding: {
      name: 'safeguarding',
      limit: readPositiveInt(env.SHINE_SAFEGUARDING_RATE_LIMIT, 60),
      windowMs: 60_000,
    } satisfies RateLimitConfig,
  };
}
