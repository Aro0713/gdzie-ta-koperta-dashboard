export const ADMIN_SESSION_COOKIE = "gtk_admin_session";
export const ADMIN_SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 dni w sekundach

export type AdminSession = {
  username: string;
  authMethod: "osm" | "secret";
  osmUserId?: number | null;
  osmAccessToken?: string | null;
  issuedAt: number;
  expiresAt: number;
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export function getAdminSecret(): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error("Missing ADMIN_SECRET in environment variables.");
  }
  return secret.trim().replace(/^["']|["']$/g, "");
}

export function isAdminWhitelisted(
  osmUsername?: string | null,
  osmUserId?: number | string | null
): boolean {
  const rawList = (process.env.ADMIN_OSM_USERS || "808sBartye")
    .trim()
    .replace(/^["']|["']$/g, "");
  const allowed = rawList
    .split(",")
    .map((item) => item.trim().replace(/^["']|["']$/g, "").toLowerCase())
    .filter(Boolean);

  if (allowed.length === 0) return false;

  const usernameLower = (osmUsername || "").trim().toLowerCase();
  const idStr = osmUserId !== undefined && osmUserId !== null ? String(osmUserId).trim() : "";

  if (usernameLower && allowed.includes(usernameLower)) {
    return true;
  }
  if (idStr && allowed.includes(idStr)) {
    return true;
  }
  return false;
}

export async function signAdminSession(session: AdminSession): Promise<string> {
  const secret = getAdminSecret();
  const key = await getHmacKey(secret);

  const payloadJson = JSON.stringify(session);
  const enc = new TextEncoder();
  const payloadBytes = enc.encode(payloadJson);
  const payloadB64 = base64UrlEncode(payloadBytes);

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(payloadB64)
  );
  const signatureB64 = base64UrlEncode(new Uint8Array(signatureBuffer));

  return `${payloadB64}.${signatureB64}`;
}

export async function verifyAdminSession(token: string | undefined | null): Promise<AdminSession | null> {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signatureB64] = parts;
  if (!payloadB64 || !signatureB64) return null;

  try {
    const secret = getAdminSecret();
    const key = await getHmacKey(secret);
    const enc = new TextEncoder();

    const signatureBytes = base64UrlDecode(signatureB64);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes as BufferSource,
      enc.encode(payloadB64)
    );

    if (!isValid) {
      return null;
    }

    const payloadBytes = base64UrlDecode(payloadB64);
    const payloadJson = new TextDecoder().decode(payloadBytes);
    const session = JSON.parse(payloadJson) as AdminSession;

    if (!session || typeof session.expiresAt !== "number") {
      return null;
    }

    if (Date.now() > session.expiresAt) {
      return null;
    }

    return session;
  } catch (err) {
    return null;
  }
}

export function getAdminCookieOptions(maxAge = ADMIN_SESSION_MAX_AGE) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function getAdminSessionFromRequest(
  req: Request
): Promise<AdminSession | null> {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${ADMIN_SESSION_COOKIE}=([^;]+)`)
  );
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  return verifyAdminSession(token);
}

export async function requireAdmin(req?: Request): Promise<AdminSession> {
  let session: AdminSession | null = null;
  if (req) {
    session = await getAdminSessionFromRequest(req);
  } else {
    // W środowisku Next.js Server Components / Route Handler bez req
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
      if (token) {
        session = await verifyAdminSession(token);
      }
    } catch {
      // Fallback
    }
  }

  if (!session) {
    throw new Error("UNAUTHORIZED_ADMIN");
  }

  return session;
}

export async function timingSafeCompare(a: string, b: string): Promise<boolean> {
  const cleanA = a.trim().replace(/^["']|["']$/g, "");
  const cleanB = b.trim().replace(/^["']|["']$/g, "");

  const enc = new TextEncoder();
  const aBuf = enc.encode(cleanA);
  const bBuf = enc.encode(cleanB);

  // Zabezpieczenie przed atakami czasowymi: haszujemy obie wartości SHA-256
  // i porównujemy bajt po bajcie stałą długość 32 bajtów
  const aHash = new Uint8Array(await crypto.subtle.digest("SHA-256", aBuf));
  const bHash = new Uint8Array(await crypto.subtle.digest("SHA-256", bBuf));

  let diff = aBuf.length ^ bBuf.length;
  for (let i = 0; i < aHash.length; i++) {
    diff |= aHash[i] ^ bHash[i];
  }
  return diff === 0;
}
