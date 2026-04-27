import type { AuthDiscovery, ServerConfig } from "./types";
import { refreshOAuthToken, shouldRefreshOAuthToken } from "./oauth";
import { getOAuthTokenForUpdate, putOAuthTokenInCache } from "./token-cache";

export function resolveProbeHeaders(server: ServerConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    ...(server.headers ?? {}),
  };

  if (server.auth.kind === "bearer") {
    const value = process.env[server.auth.env];
    if (value) {
      headers.Authorization = value.startsWith("Bearer ") ? value : `Bearer ${value}`;
    }
  }

  return headers;
}

export async function resolveHeaders(server: ServerConfig): Promise<Record<string, string>> {
  const headers = resolveProbeHeaders(server);

  if (server.auth.kind === "oauth-token") {
    const token = await resolveOAuthToken(server);
    if (token) {
      headers.Authorization = `${normalizeAuthScheme(token.tokenType)} ${token.accessToken}`;
    }
  }

  return headers;
}

async function resolveOAuthToken(server: ServerConfig) {
  if (server.auth.kind !== "oauth-token") return undefined;

  const { cache, token } = await getOAuthTokenForUpdate(server.auth.tokenKey);
  if (!token || !shouldRefreshOAuthToken(token)) return token;

  const refreshed = await refreshOAuthToken({
    issuer: issuerFromTokenKey(server.auth.tokenKey),
    resourceUrl: server.url,
    token,
  });
  await putOAuthTokenInCache(cache, server.auth.tokenKey, refreshed);
  return refreshed;
}

function issuerFromTokenKey(tokenKey: string): string {
  const separator = tokenKey.indexOf(":");
  if (separator === -1) {
    throw new Error(`Invalid OAuth token key: ${tokenKey}`);
  }
  return tokenKey.slice(separator + 1);
}

export function normalizeAuthScheme(tokenType: string): string {
  const normalized = tokenType.toLowerCase();
  return normalized === "bearer" || normalized === "bot" || normalized === "user"
    ? "Bearer"
    : tokenType;
}

export function authFromBearerEnv(env: string | undefined): AuthDiscovery | undefined {
  if (!env) return undefined;
  return { kind: "bearer", source: "env", env, confidence: "configured" };
}
