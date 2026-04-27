import type { AuthDiscovery } from "./types";

export async function discoverAuth(
  url: URL,
  headers: Record<string, string>,
): Promise<AuthDiscovery> {
  const response = await fetch(url, { method: "GET", headers });

  if (response.status !== 401 && response.status !== 403) {
    return { kind: "none" };
  }

  const authenticate = response.headers.get("www-authenticate");
  const metadataUrl = parseResourceMetadataUrl(authenticate);
  if (!metadataUrl) {
    return {
      kind: "unknown",
      reason: `Server returned ${response.status} without OAuth resource metadata.`,
    };
  }

  try {
    const metadataResponse = await fetch(metadataUrl, {
      headers: { Accept: "application/json" },
    });
    if (!metadataResponse.ok) {
      return {
        kind: "oauth",
        confidence: "inferred",
        resourceMetadataUrl: metadataUrl,
      };
    }

    const metadata = (await metadataResponse.json()) as Record<string, unknown>;
    const result: AuthDiscovery = {
      kind: "oauth",
      confidence: "confirmed",
      resourceMetadataUrl: metadataUrl,
    };
    const authorizationServers = stringArray(metadata.authorization_servers);
    if (authorizationServers) result.authorizationServers = authorizationServers;
    const scopesSupported = stringArray(metadata.scopes_supported);
    if (scopesSupported) result.scopesSupported = scopesSupported;
    return result;
  } catch {
    return {
      kind: "oauth",
      confidence: "inferred",
      resourceMetadataUrl: metadataUrl,
    };
  }
}

export function parseResourceMetadataUrl(header: string | null): string | undefined {
  if (!header) return undefined;
  const match = header.match(/resource_metadata="([^"]+)"/i);
  return match?.[1];
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter((entry): entry is string => typeof entry === "string");
  return entries.length > 0 ? entries : undefined;
}
