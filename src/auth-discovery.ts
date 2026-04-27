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
  const metadataUrls = parseResourceMetadataUrls(authenticate);
  if (metadataUrls.length === 0) {
    return {
      kind: "unknown",
      reason: `Server returned ${response.status} without OAuth resource metadata.`,
    };
  }

  for (const metadataUrl of metadataUrls) {
    try {
      const metadataResponse = await fetch(metadataUrl, {
        headers: { Accept: "application/json" },
      });
      if (!metadataResponse.ok) continue;

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
      continue;
    }
  }

  const fallbackMetadataUrl = metadataUrls[metadataUrls.length - 1]!;
  return {
    kind: "oauth",
    confidence: "inferred",
    resourceMetadataUrl: fallbackMetadataUrl,
  };
}

export function parseResourceMetadataUrl(header: string | null): string | undefined {
  return parseResourceMetadataUrls(header).at(-1);
}

export function parseResourceMetadataUrls(header: string | null): string[] {
  if (!header) return [];
  const matches = header.matchAll(/resource_metadata="([^"]+)"/gi);
  return [...matches].map((match) => match[1]).filter((url): url is string => !!url);
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter((entry): entry is string => typeof entry === "string");
  return entries.length > 0 ? entries : undefined;
}
