import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import type { OAuthToken, TokenCache } from "./types";

const TOKEN_CACHE_PATH = path.join(".agents", "mcpx", "tokens.json");

export function getTokenCachePath(): string {
  return path.join(homedir(), TOKEN_CACHE_PATH);
}

export async function readTokenCache(): Promise<TokenCache> {
  const filePath = getTokenCachePath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as TokenCache;
    if (parsed.version !== 1 || !parsed.oauth || typeof parsed.oauth !== "object") {
      throw new Error(`Invalid mcpx token cache at ${filePath}.`);
    }
    return { version: 1, oauth: parsed.oauth, oauthClientSecrets: parsed.oauthClientSecrets ?? {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, oauth: {}, oauthClientSecrets: {} };
    }
    throw error;
  }
}

export async function writeTokenCache(cache: TokenCache): Promise<void> {
  const filePath = getTokenCachePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(filePath, `${JSON.stringify(cache, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function getOAuthToken(tokenKey: string): Promise<OAuthToken | undefined> {
  const cache = await readTokenCache();
  return cache.oauth[tokenKey];
}

export async function getOAuthTokenForUpdate(tokenKey: string): Promise<{
  cache: TokenCache;
  token: OAuthToken | undefined;
}> {
  const cache = await readTokenCache();
  return { cache, token: cache.oauth[tokenKey] };
}

export async function putOAuthTokenWithClientSecret(
  tokenKey: string,
  token: OAuthToken,
  clientSecret?: string,
): Promise<void> {
  const cache = await readTokenCache();
  cache.oauth[tokenKey] = token;
  if (clientSecret && token.clientSecretKey) {
    cache.oauthClientSecrets ??= {};
    cache.oauthClientSecrets[token.clientSecretKey] = clientSecret;
  }
  await writeTokenCache(cache);
}

export async function getOAuthClientSecret(secretKey: string): Promise<string | undefined> {
  const cache = await readTokenCache();
  return cache.oauthClientSecrets?.[secretKey];
}

export async function putOAuthTokenInCache(
  cache: TokenCache,
  tokenKey: string,
  token: OAuthToken,
): Promise<void> {
  cache.oauth[tokenKey] = token;
  await writeTokenCache(cache);
}

export async function removeOAuthToken(tokenKey: string): Promise<boolean> {
  const cache = await readTokenCache();
  const removed = removeOAuthTokenFromCache(cache, tokenKey);
  if (removed) {
    await writeTokenCache(cache);
  }
  return removed;
}

export function removeOAuthTokenFromCache(cache: TokenCache, tokenKey: string): boolean {
  const token = cache.oauth[tokenKey];
  if (!token) return false;
  if (token.clientSecretKey && cache.oauthClientSecrets) {
    delete cache.oauthClientSecrets[token.clientSecretKey];
  }
  delete cache.oauth[tokenKey];
  return true;
}
