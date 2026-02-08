import type { Env } from "../bindings";

const DEFAULT_TTL_SECONDS = 300;

export async function getCachedJson<T>(
  env: Env,
  key: string,
): Promise<T | null> {
  const value = await env.SESSIONS_KV.get(key);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    // Corrupted cache entry, treat as miss
    return null;
  }
}

export async function setCachedJson(
  env: Env,
  key: string,
  value: unknown,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<void> {
  await env.SESSIONS_KV.put(key, JSON.stringify(value), {
    expirationTtl: ttlSeconds,
  });
}

export async function deleteCacheKeys(env: Env, keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  await Promise.all(keys.map((key) => env.SESSIONS_KV.delete(key)));
}
