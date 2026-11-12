import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const { pathname } = request.nextUrl;

  // 1. Ignoruj zasoby statyczne, API, pliki z rozszerzeniem i wewnętrzne trasy Next.js
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // 2. Jeśli ktoś wejdzie przez starą subdomenę app. (np. app.gdzietakoperta.pl),
  // przekieruj trwale na główną domenę do /app
  if (host.startsWith("app.")) {
    const rootHost = host.replace(/^app\./, "");
    const destinationPath = pathname === "/" ? "/app" : pathname;
    const protocol = request.nextUrl.protocol || "https:";
    const redirectUrl = new URL(destinationPath, `${protocol}//${rootHost}`);
    redirectUrl.search = request.nextUrl.search;
    return NextResponse.redirect(redirectUrl, 308);
  }

  // 3. Główna domena (gdzietakoperta.pl) – standardowa obsługa tras
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Dopasuj wszystkie ścieżki z wyjątkiem plików statycznych Next.js
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
