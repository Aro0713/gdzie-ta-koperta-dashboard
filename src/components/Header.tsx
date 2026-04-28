import Link from "next/link";
import { appConfig } from "@/lib/appConfig";

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
        <Link href="/zglos">Zgłoś kopertę</Link>
        <Link href="/wniosek">Wniosek do urzędu</Link>
      </nav>
    </header>
  );
}
