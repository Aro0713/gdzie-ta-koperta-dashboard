const rawApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!rawApiBaseUrl) {
  throw new Error("Missing EXPO_PUBLIC_API_BASE_URL");
}

export const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiBaseUrl}${normalizedPath}`;
}
