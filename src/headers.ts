import type { AuthDiscovery, ServerConfig } from "./types";
import { getOAuthToken } from "./token-cache";

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
    const token = await getOAuthToken(server.auth.tokenKey);
    if (token) {
      headers.Authorization = `${token.tokenType} ${token.accessToken}`;
    }
  }

  return headers;
}

export function authFromBearerEnv(env: string | undefined): AuthDiscovery | undefined {
  if (!env) return undefined;
  return { kind: "bearer", source: "env", env, confidence: "configured" };
}
