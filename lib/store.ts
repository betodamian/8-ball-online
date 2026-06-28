// Storage layer for lobbies.
//
// In production it uses Upstash Redis (set up via the Vercel Marketplace
// "Upstash for Redis" integration). Locally, if no credentials are present,
// it falls back to an in-memory Map so you can develop without any account.
// (The in-memory store only lives within a single server process, which is
// fine for `next dev`; production must use Upstash.)

import { Redis } from "@upstash/redis";
import type { GameState } from "./game";

const LOBBY_TTL_SECONDS = 60 * 60 * 6; // lobbies expire after 6 hours
const KEY_PREFIX = "8ball:lobby:";

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

let redis: Redis | null = null;
if (url && token) {
  redis = new Redis({ url, token });
}

export function usingRedis(): boolean {
  return redis !== null;
}

// Module-level fallback store. Survives across requests in one dev process.
const memory: Map<string, { value: GameState; expires: number }> =
  (globalThis as any).__eightBallStore ?? new Map();
(globalThis as any).__eightBallStore = memory;

export async function getLobby(code: string): Promise<GameState | null> {
  const key = KEY_PREFIX + code;
  if (redis) {
    const data = await redis.get<GameState>(key);
    return data ?? null;
  }
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry.value;
}

export async function setLobby(code: string, state: GameState): Promise<void> {
  const key = KEY_PREFIX + code;
  if (redis) {
    await redis.set(key, state, { ex: LOBBY_TTL_SECONDS });
    return;
  }
  memory.set(key, { value: state, expires: Date.now() + LOBBY_TTL_SECONDS * 1000 });
}

export async function lobbyExists(code: string): Promise<boolean> {
  return (await getLobby(code)) !== null;
}
