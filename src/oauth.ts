import { createHash, randomBytes } from "node:crypto";

import { putOAuthToken } from "./token-cache";
import type { AuthDiscovery, OAuthServerMetadata, OAuthToken } from "./types";

type OAuthClientRegistration = {
  clientId: string;
};

type OAuthCallbackResult = {
  code: string;
  state: string;
};

type OAuthCallbackServer = {
  redirectUri: string;
  result: Promise<OAuthCallbackResult>;
  close: () => void;
};

type AuthenticatedOAuth = Extract<AuthDiscovery, { kind: "oauth-token" }>;
type DiscoveredOAuth = Extract<AuthDiscovery, { kind: "oauth" }>;

const LOCALHOST = "127.0.0.1";
const CALLBACK_PATH = "/callback";
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

export async function authenticateOAuthServer(
  serverName: string,
  resourceUrl: URL,
  auth: DiscoveredOAuth,
): Promise<AuthenticatedOAuth> {
  const authorizationServer = auth.authorizationServers?.[0];
  if (!authorizationServer) {
    throw new Error("OAuth authentication requires an authorization server URL.");
  }

  const metadata = await fetchAuthorizationServerMetadata(authorizationServer);
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  const state = base64Url(randomBytes(24));
  const callback = await waitForOAuthCallback(state);

  try {
    const client = await registerOAuthClient(metadata, callback.redirectUri);
    const scope = chooseOAuthScope(auth.scopesSupported, metadata.scopesSupported);
    const authorizationUrl = buildAuthorizationUrl({
      metadata,
      clientId: client.clientId,
      redirectUri: callback.redirectUri,
      resourceUrl: resourceUrl.toString(),
      scope,
      state,
      challenge,
    });

    console.error(`Opening browser for OAuth authentication: ${authorizationUrl}`);
    openBrowser(authorizationUrl);

    const callbackResult = await callback.result;
    const token = await exchangeAuthorizationCode({
      metadata,
      clientId: client.clientId,
      redirectUri: callback.redirectUri,
      resourceUrl: resourceUrl.toString(),
      code: callbackResult.code,
      verifier,
    });

    const tokenKey = `${serverName}:${metadata.issuer}`;
    await putOAuthToken(tokenKey, token);
    return { kind: "oauth-token", tokenKey, confidence: "confirmed" };
  } finally {
    callback.close();
  }
}

export async function fetchAuthorizationServerMetadata(
  issuer: string,
): Promise<OAuthServerMetadata> {
  const metadataUrl = new URL("/.well-known/oauth-authorization-server", issuer);
  const response = await fetch(metadataUrl, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Failed to fetch OAuth server metadata from ${metadataUrl}.`);
  }

  const metadata = (await response.json()) as Record<string, unknown>;
  const authorizationEndpoint = stringField(metadata.authorization_endpoint);
  const tokenEndpoint = stringField(metadata.token_endpoint);
  const issuerValue = stringField(metadata.issuer) ?? issuer;
  if (!authorizationEndpoint || !tokenEndpoint) {
    throw new Error(`OAuth server metadata at ${metadataUrl} is missing required endpoints.`);
  }

  const result: OAuthServerMetadata = {
    issuer: issuerValue,
    authorizationEndpoint,
    tokenEndpoint,
  };
  const registrationEndpoint = stringField(metadata.registration_endpoint);
  if (registrationEndpoint) result.registrationEndpoint = registrationEndpoint;
  const scopesSupported = stringArray(metadata.scopes_supported);
  if (scopesSupported) result.scopesSupported = scopesSupported;
  const methods = stringArray(metadata.code_challenge_methods_supported);
  if (methods) result.codeChallengeMethodsSupported = methods;
  return result;
}

export async function registerOAuthClient(
  metadata: OAuthServerMetadata,
  redirectUri: string,
): Promise<OAuthClientRegistration> {
  if (!metadata.registrationEndpoint) {
    throw new Error("OAuth server does not advertise dynamic client registration.");
  }

  const response = await fetch(metadata.registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "MCPX",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: "native",
    }),
  });

  if (!response.ok) {
    throw new Error(`OAuth dynamic client registration failed: ${await response.text()}`);
  }

  const body = (await response.json()) as Record<string, unknown>;
  const clientId = stringField(body.client_id);
  if (!clientId) {
    throw new Error("OAuth dynamic client registration response did not include client_id.");
  }
  return { clientId };
}

export function chooseOAuthScope(
  resourceScopes: string[] | undefined,
  serverScopes: string[] | undefined,
): string {
  const supported = new Set(serverScopes ?? []);
  const scopes = (resourceScopes ?? []).filter((scope) => {
    return supported.size === 0 || supported.has(scope);
  });
  return scopes.join(" ");
}

function buildAuthorizationUrl(options: {
  metadata: OAuthServerMetadata;
  clientId: string;
  redirectUri: string;
  resourceUrl: string;
  scope: string;
  state: string;
  challenge: string;
}): string {
  const url = new URL(options.metadata.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("code_challenge", options.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", options.state);
  url.searchParams.set("resource", options.resourceUrl);
  if (options.scope) url.searchParams.set("scope", options.scope);
  return url.toString();
}

async function exchangeAuthorizationCode(options: {
  metadata: OAuthServerMetadata;
  clientId: string;
  redirectUri: string;
  resourceUrl: string;
  code: string;
  verifier: string;
}): Promise<OAuthToken> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    code: options.code,
    code_verifier: options.verifier,
    resource: options.resourceUrl,
  });

  const response = await fetch(options.metadata.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`OAuth token exchange failed: ${await response.text()}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const accessToken = stringField(payload.access_token);
  const tokenType = stringField(payload.token_type) ?? "Bearer";
  if (!accessToken) {
    throw new Error("OAuth token response did not include access_token.");
  }

  const token: OAuthToken = {
    accessToken,
    tokenType,
  };
  const refreshToken = stringField(payload.refresh_token);
  if (refreshToken) token.refreshToken = refreshToken;
  const scope = stringField(payload.scope);
  if (scope) token.scope = scope;
  const expiresIn = numberField(payload.expires_in);
  if (expiresIn !== undefined) {
    token.expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  }
  return token;
}

function waitForOAuthCallback(expectedState: string): OAuthCallbackServer {
  let server: Bun.Server<undefined> | undefined;
  const result = new Promise<OAuthCallbackResult>((finish, fail) => {
    const complete = (outcome: "finish" | "fail", value: OAuthCallbackResult | Error) => {
      clearTimeout(timer);
      server?.stop();
      if (outcome === "finish") {
        finish(value as OAuthCallbackResult);
        return;
      }
      fail(value);
    };

    const timer = setTimeout(() => {
      complete("fail", new Error("OAuth authentication timed out."));
    }, CALLBACK_TIMEOUT_MS);

    server = Bun.serve({
      hostname: LOCALHOST,
      port: 0,
      routes: {
        [CALLBACK_PATH]: (request) => {
          const requestUrl = new URL(request.url);
          const code = requestUrl.searchParams.get("code");
          const state = requestUrl.searchParams.get("state");
          const error = requestUrl.searchParams.get("error");
          if (error) {
            complete("fail", new Error(`OAuth authorization failed: ${error}`));
            return new Response(`OAuth failed: ${error}`, { status: 400 });
          }
          if (!code || state !== expectedState) {
            complete("fail", new Error("Invalid OAuth callback."));
            return new Response("Invalid OAuth callback.", { status: 400 });
          }

          complete("finish", { code, state });
          return new Response("MCPX authentication complete. You can close this tab.");
        },
      },
      fetch() {
        return new Response("Not found", { status: 404 });
      },
    });
  });

  if (!server) {
    throw new Error("Failed to start local OAuth callback server.");
  }

  return {
    redirectUri: `http://${LOCALHOST}:${server.port}${CALLBACK_PATH}`,
    result,
    close: () => server?.stop(),
  };
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  Bun.spawn([command, ...args], {
    stdout: "ignore",
    stderr: "ignore",
  });
}

function base64Url(input: Buffer): string {
  return input.toString("base64url");
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((entry): entry is string => typeof entry === "string");
  return values.length > 0 ? values : undefined;
}
