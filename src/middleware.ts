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

  // 2. Wykrywanie subdomeny aplikacji (np. app.gdzietakoperta.pl lub w dev app.localhost:3000)
  const isAppSubdomain =
    host.startsWith("app.") ||
    host.startsWith("app-") ||
    request.nextUrl.searchParams.get("view") === "app";

  if (isAppSubdomain) {
    // Jeśli użytkownik jest na stronie głównej subdomeny (app.gdzietakoperta.pl/),
    // przepisujemy URL wewnętrznie do /app, zachowując czysty adres w przeglądarce
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/app";
      return NextResponse.rewrite(url);
    }

    return NextResponse.next();
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
