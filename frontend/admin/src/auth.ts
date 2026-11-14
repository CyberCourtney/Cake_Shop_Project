// Sign-in with Cognito's managed login page, using the Authorization Code flow with PKCE.
//
// Why this flow: the portal is a public browser app, so it cannot keep a client secret.
// PKCE proves that the app that started the sign-in is the one finishing it. The password
// and the MFA code are typed into Cognito's page, never into this app.
//
// Tokens are kept in memory only (not localStorage), so a script injected into the page
// later could not find them in storage. Reloading the page signs in again through Cognito,
// which normally remembers the session, so no password is needed for a while.

interface Config {
  cognitoDomain: string;
  clientId: string;
}
interface Tokens {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresAt: number;
}

let config: Config | null = null;
let tokens: Tokens | null = null;
export const LOCAL_DEV = import.meta.env.DEV;

const redirectUri = () => `${window.location.origin}/admin/callback`;
const signedOutUri = () => `${window.location.origin}/admin/`;

async function loadConfig(): Promise<Config> {
  if (config) return config;
  const res = await fetch("/admin/config.json", { cache: "no-store" });
  if (!res.ok) throw new Error("The admin portal's settings file is missing.");
  config = (await res.json()) as Config;
  return config;
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

function sessionSet(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* storage blocked; sign-in will simply restart */
  }
}
function sessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function signIn(): Promise<never> {
  const c = await loadConfig();
  const verifier = randomString(48);
  const state = randomString(16);
  const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  // The verifier and state must survive the round trip to Cognito, so they go in
  // sessionStorage briefly. Neither is useful to anyone without the one-time code.
  sessionSet("kvc.pkce", JSON.stringify({ verifier, state, returnTo: window.location.pathname + window.location.search }));
  const url = new URL(`https://${c.cognitoDomain}/oauth2/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: c.clientId,
    redirect_uri: redirectUri(),
    scope: "openid email",
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
  }).toString();
  window.location.assign(url.toString());
  return new Promise<never>(() => {});
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const c = await loadConfig();
  const res = await fetch(`https://${c.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId, ...body }).toString(),
  });
  if (!res.ok) throw new Error("Sign-in failed. Please try again.");
  const t = await res.json();
  return {
    accessToken: t.access_token,
    idToken: t.id_token,
    refreshToken: t.refresh_token ?? body.refresh_token,
    expiresAt: Date.now() + (t.expires_in - 60) * 1000,
  };
}

/** Finishes sign-in on /admin/callback. Returns the page to go back to. */
export async function handleCallback(): Promise<string> {
  const params = new URLSearchParams(window.location.search);
  const saved = JSON.parse(sessionGet("kvc.pkce") ?? "null") as { verifier: string; state: string; returnTo: string } | null;
  sessionSet("kvc.pkce", null);
  if (params.get("error")) throw new Error(params.get("error_description") ?? "Sign-in was cancelled.");
  const code = params.get("code");
  if (!code || !saved || params.get("state") !== saved.state) throw new Error("This sign-in link has expired. Please sign in again.");
  tokens = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: saved.verifier });
  return saved.returnTo && !saved.returnTo.startsWith("/admin/callback") ? saved.returnTo : "/admin/";
}

/** A valid access token, refreshed if needed. Null means "not signed in". */
export async function getAccessToken(): Promise<string | null> {
  if (LOCAL_DEV) return "local-dev";
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt) return tokens.accessToken;
  if (!tokens.refreshToken) return null;
  try {
    tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
    return tokens.accessToken;
  } catch {
    tokens = null;
    return null;
  }
}

export function forceRefresh() {
  if (tokens) tokens.expiresAt = 0;
}

export function currentUserEmail(): string {
  if (LOCAL_DEV) return "local-admin";
  if (!tokens) return "";
  try {
    const payload = JSON.parse(atob(tokens.idToken.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.email ?? "");
  } catch {
    return "";
  }
}

export async function signOut(): Promise<void> {
  tokens = null;
  if (LOCAL_DEV) {
    window.location.assign("/admin/");
    return;
  }
  const c = await loadConfig();
  const url = new URL(`https://${c.cognitoDomain}/logout`);
  url.search = new URLSearchParams({ client_id: c.clientId, logout_uri: signedOutUri() }).toString();
  window.location.assign(url.toString());
}
