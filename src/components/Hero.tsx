"use client";

import { useEffect, useState } from "react";
import { getAppUrl } from "@/lib/appUrl";

export function Hero() {
  const [appUrl, setAppUrl] = useState("/app");

  useEffect(() => {
    setAppUrl(getAppUrl());
  }, []);

  return (
    <section className="hero-card">
      <div className="hero-copy">
        <p className="eyebrow">projekt społeczny · otwarte dane · dostępność</p>

        <h1>Gdzie ta koperta?</h1>

        <p className="hero-lead">
          Platforma GIS wspierająca kierowców z niepełnosprawnościami w lokalizowaniu,
          weryfikacji i dojeździe do dedykowanych stanowisk postojowych w polskich miastach.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <a
            href={appUrl}
            className="inline-flex items-center justify-center min-h-[46px] px-6 rounded-full text-white font-bold text-sm bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-700 hover:to-sky-600 shadow-lg shadow-sky-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <span>Uruchom aplikację</span>
            <span className="ml-2 font-mono text-base" aria-hidden="true">➔</span>
          </a>

          <a
            href="#jak-dodac"
            className="inline-flex items-center justify-center min-h-[46px] px-5 rounded-full text-slate-700 font-semibold text-sm bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 shadow-sm transition-all transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <span>Jak dodać na telefon</span>
          </a>
        </div>
      </div>

      <div
        className="hero-photo"
        role="img"
        aria-label="Niebieskie stanowisko postojowe dla osób z niepełnosprawnościami"
      />
    </section>
  );
}
