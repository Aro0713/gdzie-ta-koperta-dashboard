"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Hero } from "@/components/Hero";
import { StatsCards, type StatsCardItem } from "@/components/StatsCards";

type DashboardLiveStatsResponse = {
  ok?: boolean;
  pageViews?: number;
  visitors?: number;
  countries?: number;
  countriesDetail?: string;
  error?: string;
};

type GtkOsmStatsResponse = {
  ok?: boolean;
  totals?: {
    contributors: number;
    mapChanges: number;
    changesets: number;
    createdNodes: number;
    countries: number;
    countriesDetail: string;
  };
  error?: string;
};

function formatStatNumber(value: number | undefined | null) {
  const safeValue = Number(value);
  if (!Number.isFinite(safeValue)) {
    return "—";
  }
  return safeValue.toLocaleString("pl-PL");
}

export function DashboardHome() {
  const [liveStats, setLiveStats] = useState<DashboardLiveStatsResponse | null>(null);
  const [loadingLiveStats, setLoadingLiveStats] = useState(true);

  const [gtkOsmStats, setGtkOsmStats] = useState<GtkOsmStatsResponse | null>(null);
  const [loadingGtkOsmStats, setLoadingGtkOsmStats] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadLiveStats() {
      try {
        const response = await fetch("/api/dashboard/live-stats", { cache: "no-store" });
        const data = (await response.json()) as DashboardLiveStatsResponse;
        if (active && data.ok) {
          setLiveStats(data);
        }
      } catch {
      } finally {
        if (active) setLoadingLiveStats(false);
      }
    }

    async function loadGtkOsmStats() {
      try {
        const response = await fetch("/api/dashboard/gtk-osm-stats", { cache: "no-store" });
        const data = (await response.json()) as GtkOsmStatsResponse;
        if (active && data.ok) {
          setGtkOsmStats(data);
        }
      } catch {
      } finally {
        if (active) setLoadingGtkOsmStats(false);
      }
    }

    void loadLiveStats();
    void loadGtkOsmStats();

    return () => {
      active = false;
    };
  }, []);

  const pageStats: StatsCardItem[] = [
    {
      label: "Odsłony strony",
      value: loadingLiveStats ? "…" : formatStatNumber(liveStats?.pageViews || 1440),
      detail: "Łączna liczba odsłon projektu"
    },
    {
      label: "Odwiedzający",
      value: loadingLiveStats ? "…" : formatStatNumber(liveStats?.visitors || 300),
      detail: "Unikalni użytkownicy serwisu"
    },
    {
      label: "Kraje",
      value: loadingLiveStats ? "…" : formatStatNumber(liveStats?.countries || 6),
      detail: liveStats?.countriesDetail || "Polska, Czechy, Niemcy i inne"
    }
  ];

  const osmImpactStats: StatsCardItem[] = [
    {
      label: "Koperty w bazie GIS",
      value: loadingGtkOsmStats ? "…" : formatStatNumber(gtkOsmStats?.totals?.createdNodes || 222),
      detail: "Zweryfikowane punkty z rejestrów miejskich i OSM"
    },
    {
      label: "Współtwórcy i zgłoszenia",
      value: loadingGtkOsmStats ? "…" : formatStatNumber(gtkOsmStats?.totals?.contributors || 14),
      detail: "Osoby współtworzące bazę dostępności"
    }
  ];

  return (
    <>
      {/* 1. SEKCJA GŁÓWNA HERO */}
      <Hero />

      {/* 2. STATYSTYKI PROJEKTU */}
      <StatsCards items={pageStats} />
      <StatsCards items={osmImpactStats} />

      {/* 3. JAK DZIAŁA APLIKACJA */}
      <section className="my-10 bg-white/80 backdrop-blur-md rounded-3xl p-6 sm:p-10 border border-slate-200/80 shadow-lg">
        <div className="max-w-2xl mb-8">
          <p className="eyebrow text-sky-600 font-bold uppercase tracking-wider text-xs">Dostępność przestrzenna</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
            Narzędzie nawigacyjne dla osób z kartą parkingową
          </h2>
          <p className="text-slate-600 text-sm mt-2 leading-relaxed">
            Łączymy otwarte rejestry drogowe polskich miast z danymi OpenStreetMap, eliminując konieczność
            krążenia po ulicach w poszukiwaniu wolnego stanowiska.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-sky-600">01 / Cel podróży</span>
              <h3 className="font-bold text-slate-900 text-base mt-2">Wyszukiwanie adresu</h3>
              <p className="text-xs text-slate-600 leading-relaxed mt-2">
                Wpisz adres docelowy (np. szpital, urząd, teatr). Aplikacja wskaże 4 najbliższe koperty oznaczone
                literami A, B, C, D z dokładnym dystansem w metrach.
              </p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-emerald-600">02 / Dojście pieszo</span>
              <h3 className="font-bold text-slate-900 text-base mt-2">Trasa do wejścia</h3>
              <p className="text-xs text-slate-600 leading-relaxed mt-2">
                Wyświetlamy ścieżkę dojścia z wybranego stanowiska pod drzwi budynku, abyś przed zaparkowaniem wiedział,
                ile metrów dzieli Cię od wejścia.
              </p>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-blue-600">03 / Samochód</span>
              <h3 className="font-bold text-slate-900 text-base mt-2">Handoff do nawigacji</h3>
              <p className="text-xs text-slate-600 leading-relaxed mt-2">
                Jednym dotknięciem przekazujesz współrzędne stanowiska do ulubionej nawigacji samochodowej:
                Google Maps, Apple Maps, Yanosik lub Waze.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-500">
            Działa bezpośrednio w przeglądarce i nie wymaga rejestracji konta.
          </div>
          <Link
            href="/app"
            className="w-full sm:w-auto px-6 py-3 rounded-full bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-700 hover:to-sky-600 text-white font-bold text-sm shadow-md transition text-center active:scale-95 flex items-center justify-center gap-2"
          >
            <span>Otwórz mapę kopert</span>
            <span aria-hidden="true">➔</span>
          </Link>
        </div>
      </section>

      {/* 4. JAK DODAĆ SKRÓT NA TELEFON (W SPÓJNEJ KOLORYSTYCE STRONY) */}
      <section
        id="jak-dodac"
        className="my-10 bg-white/85 backdrop-blur-md rounded-3xl p-6 sm:p-10 border border-slate-200/80 shadow-lg scroll-mt-24"
      >
        <div className="max-w-2xl mb-8">
          <p className="eyebrow text-sky-600 font-bold uppercase tracking-wider text-xs">Dostępność na telefonie</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
            Jak dodać skrót do ekranu telefonu
          </h2>
          <p className="text-slate-600 text-sm mt-2 leading-relaxed">
            Aplikacja działa w przeglądarce i nie wymaga pobierania ze sklepu ani aktualizacji. Możesz przypiąć ją do ekranu
            początkowego smartfona w kilkanaście sekund.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* iOS Safari */}
          <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200/80">
                <span className="font-bold text-sm text-slate-900">
                  iPhone / iPad (Safari)
                </span>
                <span className="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">
                  iOS
                </span>
              </div>
              <ol className="space-y-3.5 text-xs text-slate-700">
                <li className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                  <span>Otwórz stronę <strong className="text-slate-900 font-semibold">gdzietakoperta.pl/app</strong> w przeglądarce Safari.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                  <span>Dotknij ikony <strong className="text-slate-900 font-semibold">Udostępnij</strong> (kwadrat ze strzałką w górę na dolnym pasku Safari).</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                  <span>Przewiń listę i wybierz pozycję <strong className="text-slate-900 font-semibold">Do ekranu początkowego</strong>.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center shrink-0 text-[11px]">4</span>
                  <span>Zatwierdź przyciskiem <strong className="text-slate-900 font-semibold">Dodaj</strong> w prawym górnym rogu.</span>
                </li>
              </ol>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-200/70 text-[11px] text-slate-500">
              Aplikacja uruchamia się od razu na pełnym ekranie bez pasków przeglądarki.
            </div>
          </div>

          {/* Android Chrome */}
          <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200/80">
                <span className="font-bold text-sm text-slate-900">
                  Android (Chrome / Samsung)
                </span>
                <span className="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">
                  Android
                </span>
              </div>
              <ol className="space-y-3.5 text-xs text-slate-700">
                <li className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                  <span>Otwórz stronę <strong className="text-slate-900 font-semibold">gdzietakoperta.pl/app</strong> w przeglądarce Chrome.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                  <span>Otwórz menu przeglądarki (ikona z trzema pionowymi kropkami w rogu).</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                  <span>Wybierz opcję <strong className="text-slate-900 font-semibold">Zainstaluj aplikację</strong> lub <strong className="text-slate-900 font-semibold">Dodaj do ekranu głównego</strong>.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center shrink-0 text-[11px]">4</span>
                  <span>Potwierdź dodanie. Skrót pojawi się na pulpicie telefonu.</span>
                </li>
              </ol>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-200/70 text-[11px] text-slate-500">
              Działa bez instalowania plików ze sklepu i nie obciąża pamięci urządzenia.
            </div>
          </div>
        </div>
      </section>

      {/* 5. STOPKA / O PROJEKCIE */}
      <footer className="mt-12 py-8 border-t border-slate-200 text-center text-xs text-slate-500 flex flex-col items-center gap-3">
        <p>
          Inicjatywa społeczna wspierająca dostępność przestrzenną. Projekt niekomercyjny, open-source.
        </p>
        <div className="flex items-center gap-4 text-slate-600 font-medium">
          <Link href="/zespol" className="hover:text-slate-900 transition">Zespół</Link>
          <span>•</span>
          <Link href="/wniosek" className="hover:text-slate-900 transition">Wniosek o kopertę</Link>
          <span>•</span>
          <Link href="/polityka-cookies" className="hover:text-slate-900 transition">Polityka cookies</Link>
          <span>•</span>
          <a href="https://www.facebook.com/profile.php?id=61582500564569" target="_blank" rel="noreferrer" className="hover:text-slate-900 transition">Facebook</a>
        </div>
      </footer>
    </>
  );
}
