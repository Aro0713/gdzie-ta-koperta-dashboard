import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";

export const OSM_SESSION_COOKIE = "gtk_osm_session";
export const OSM_STATE_COOKIE = "gtk_osm_oauth_state";

export type OsmSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
  user: {
    id?: number;
    displayName?: string;
    accountCreated?: string;
  };
};

export type OsmConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  baseUrl: string;
  apiBaseUrl: string;
  sessionSecret: string;
};

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function getOsmConfig(): OsmConfig {
  return {
    clientId: requiredEnv("OSM_OAUTH_CLIENT_ID"),
    clientSecret: requiredEnv("OSM_OAUTH_CLIENT_SECRET"),
    redirectUri: requiredEnv("OSM_OAUTH_REDIRECT_URI"),
    baseUrl: trimTrailingSlash(
      process.env.OSM_BASE_URL || "https://www.openstreetmap.org"
    ),
    apiBaseUrl: trimTrailingSlash(
      process.env.OSM_API_BASE_URL || "https://api.openstreetmap.org/api/0.6"
    ),
    sessionSecret: requiredEnv("OSM_SESSION_SECRET")
  };
}

export function makeOauthState() {
  return randomBytes(24).toString("base64url");
}

function getSessionKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

function encode(input: Buffer) {
  return input.toString("base64url");
}

function decode(input: string) {
  return Buffer.from(input, "base64url");
}

export function encryptSession(session: OsmSession) {
  const { sessionSecret } = getOsmConfig();
  const key = getSessionKey(sessionSecret);
  const iv = randomBytes(12);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(session), "utf8");

  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final()
  ]);

  const tag = cipher.getAuthTag();

  return [encode(iv), encode(tag), encode(encrypted)].join(".");
}

export function decryptSession(value: string): OsmSession | null {
  try {
    const { sessionSecret } = getOsmConfig();
    const [ivRaw, tagRaw, encryptedRaw] = value.split(".");

    if (!ivRaw || !tagRaw || !encryptedRaw) {
      return null;
    }

    const key = getSessionKey(sessionSecret);
    const iv = decode(ivRaw);
    const tag = decode(tagRaw);
    const encrypted = decode(encryptedRaw);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return JSON.parse(decrypted.toString("utf8")) as OsmSession;
  } catch {
    return null;
  }
}

export function getCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge
  };
}

export function isSessionValid(session: OsmSession | null) {
  return Boolean(session && session.expiresAt > Date.now());
}
