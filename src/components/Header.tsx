import Link from "next/link";
import { appConfig } from "@/lib/appConfig";
import { OsmLoginStatus } from "@/components/OsmLoginStatus";

const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61582500564569";

export function Header() {
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="Strona główna Gdzie ta koperta">
        <span className="brand-mark">♿</span>
        <span>
          <strong>{appConfig.name}</strong>
          <small>społeczna mapa dostępności</small>
        </span>
      </Link>

      <nav className="top-nav" aria-label="Główna nawigacja">
        <Link href="/mapa">Mapa</Link>
        <Link href="/zespol">Zespół</Link>

        <a
          href={FACEBOOK_URL}
          className="facebook-nav-link"
          target="_blank"
          rel="noreferrer"
          aria-label="Facebook Gdzie ta Koperta, otwiera się w nowej karcie"
        >
          Facebook
        </a>

        <OsmLoginStatus />
      </nav>
    </header>
  );
}