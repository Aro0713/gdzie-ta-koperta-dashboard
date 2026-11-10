"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { appConfig } from "@/lib/appConfig";
import { OsmLoginStatus } from "@/components/OsmLoginStatus";
import { getAppUrl } from "@/lib/appUrl";

const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61582500564569";

export function Header() {
  const [appUrl, setAppUrl] = useState("/app");

  useEffect(() => {
    setAppUrl(getAppUrl());
  }, []);

  return (
    <header className="site-header">
      <Link
        href="/"
        className="brand"
        aria-label="Strona główna Gdzie ta koperta"
      >
        <span className="brand-mark" aria-hidden="true">♿</span>
        <span>
          <strong>{appConfig.name}</strong>
          <small>społeczna mapa dostępności</small>
        </span>
      </Link>

      <nav className="top-nav" aria-label="Główna nawigacja">
        <a
          href={appUrl}
          className="font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1.5 transition"
        >
          <span>Aplikacja</span>
          <span aria-hidden="true">➔</span>
        </a>
        <Link href="/zespol">Zespół</Link>
        <Link href="/wniosek">Wniosek</Link>
        <Link href="/polityka-cookies">Cookies</Link>

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
