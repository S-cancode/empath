import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../lib/redis.js";

function createRedisStore(prefix: string) {
  return new RedisStore({
    sendCommand: (...args: string[]) =>
      redis.call(args[0], ...args.slice(1)) as any,
    prefix: `rl:${prefix}:`,
  });
}

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore("auth"),
  message: { error: "Too many auth requests, try again later" },
});

// Reviewer access-code redemption: strict, so a leaked/guessed code can't be
// brute-forced. Keyed per-IP by express-rate-limit's default.
export const reviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore("review"),
  message: { error: "Too many attempts, try again later" },
});

// Apple server-to-server notifications: lenient (Apple batches + retries with
// backoff), but bounded so a forged flood can't hammer the endpoint.
export const appleNotifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore("apple-notify"),
  message: { error: "rate_limited" },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore("api"),
  message: { error: "Too many requests, try again later" },
});
