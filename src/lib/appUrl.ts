/**
 * Zwraca bezpośredni URL do subdomeny aplikacji:
 * - W produkcji: https://app.gdzietakoperta.pl
 * - Lokalnie w przeglądarce: http://app.localhost:3000 (lub bieżący port)
 * - Możliwość nadpisania przez NEXT_PUBLIC_APP_URL
 */
export function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : "";
    const protocol = window.location.protocol;

    if (host.includes("gdzietakoperta.pl")) {
      return "https://app.gdzietakoperta.pl";
    }

    if (host === "localhost" || host === "127.0.0.1") {
      return `${protocol}//app.localhost${port}`;
    }
  }

  return process.env.NODE_ENV === "production"
    ? "https://app.gdzietakoperta.pl"
    : "http://app.localhost:3000";
}

/**
 * Zwraca bezpośredni URL do strony głównej (domeny nadrzędnej):
 * - W produkcji: https://gdzietakoperta.pl
 * - Lokalnie w przeglądarce: http://localhost:3000 (lub bieżący port z usuniętym 'app.')
 * - Możliwość nadpisania przez NEXT_PUBLIC_MAIN_URL
 */
export function getMainSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_MAIN_URL) {
    return process.env.NEXT_PUBLIC_MAIN_URL;
  }

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : "";
    const protocol = window.location.protocol;

    if (host.startsWith("app.")) {
      const rootHost = host.replace(/^app\./, "");
      return `${protocol}//${rootHost}${port}`;
    }

    if (host.includes("gdzietakoperta.pl")) {
      return "https://gdzietakoperta.pl";
    }

    if (host === "localhost" || host === "127.0.0.1") {
      return `${protocol}//localhost${port}`;
    }
  }

  return process.env.NODE_ENV === "production"
    ? "https://gdzietakoperta.pl"
    : "http://localhost:3000";
}
