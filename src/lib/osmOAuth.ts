import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";

export const OSM_SESSION_COOKIE = "gtk_osm_session";
export const OSM_STATE_COOKIE = "gtk_osm_oauth_state";

const MOBILE_OAUTH_STATE_PREFIX = "mobile";
const ALLOWED_MOBILE_RETURN_PROTOCOLS = new Set([
  "gdzietakoperta:",
  "exp:",
  "exps:"
]);

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

export type MobileOauthState = {
  nonce: string;
  returnTo: string;
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

export function getBearerSessionFromAuthorization(authorization: string | null) {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function isAllowedMobileReturnTo(value: string) {
  try {
    const url = new URL(value);
    return ALLOWED_MOBILE_RETURN_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

export function makeMobileOauthState(returnTo: string) {
  if (!isAllowedMobileReturnTo(returnTo)) {
    throw new Error("Invalid mobile return URL.");
  }

  const nonce = makeOauthState();
  const payload = Buffer.from(JSON.stringify({ returnTo }), "utf8").toString(
    "base64url"
  );

  return `${MOBILE_OAUTH_STATE_PREFIX}.${nonce}.${payload}`;
}

export function parseMobileOauthState(state: string): MobileOauthState | null {
  try {
    const [prefix, nonce, payload] = state.split(".");

    if (prefix !== MOBILE_OAUTH_STATE_PREFIX || !nonce || !payload) {
      return null;
    }

    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as {
      returnTo?: unknown;
    };

    if (
      typeof parsed.returnTo !== "string" ||
      !isAllowedMobileReturnTo(parsed.returnTo)
    ) {
      return null;
    }

    return {
      nonce,
      returnTo: parsed.returnTo
    };
  } catch {
    return null;
  }
}