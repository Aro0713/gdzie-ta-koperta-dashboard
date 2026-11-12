"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function PwaInstallPrompt() {
  const [isStandalone, setIsStandalone] = useState(true); // default true to avoid SSR flash
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isDismissed, setIsDismissed] = useState(true);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Sprawdzenie, czy aplikacja jest już uruchomiona na pełnym ekranie
    const isStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      document.referrer.includes("android-app://");

    setIsStandalone(isStandaloneMode);

    // Jeśli aplikacja jest już zainstalowana – nie pokazujemy nic
    if (isStandaloneMode) {
      return;
    }

    // 2. Pamięć ukrycia (na 5 dni)
    try {
      const dismissedAt = localStorage.getItem("gtk_pwa_prompt_dismissed_at");
      if (dismissedAt) {
        const timeDiff = Date.now() - parseInt(dismissedAt, 10);
        const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
        if (timeDiff < fiveDaysMs) {
          setIsDismissed(true);
          return;
        }
      }
    } catch {}

    setIsDismissed(false);

    // 3. Wykrywanie iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleIos = /iphone|ipad|ipod/.test(userAgent) && !/crios|fxios|opios/.test(userAgent);
    setIsIos(isAppleIos);

    // 4. Przechwycenie zdarzenia instalacji dla Android / Chrome
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  if (isStandalone || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      localStorage.setItem("gtk_pwa_prompt_dismissed_at", Date.now().toString());
    } catch {}
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsDismissed(true);
      }
      setDeferredPrompt(null);
    } else if (isIos) {
      setShowIosGuide((prev) => !prev);
    }
  };

  return (
    <aside
      aria-label="Podpowiedź dodania aplikacji do ekranu głównego"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md z-40 bg-white/95 text-slate-900 backdrop-blur-md border border-slate-200/90 rounded-2xl p-4 shadow-xl transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-sky-700">
            Aplikacja na telefon
          </h3>
          <p className="text-xs text-slate-600 mt-0.5 leading-snug">
            Dodaj skrót do ekranu początkowego, aby uruchamiać mapę jednym dotknięciem.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition"
          aria-label="Zamknij podpowiedź"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Instrukcja dla iOS Safari */}
      {showIosGuide && isIos && (
        <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-700 space-y-2 bg-slate-50/80 p-3 rounded-xl border border-slate-200/60">
          <p className="font-semibold text-slate-900">
            Jak dodać na iPhone:
          </p>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
            <span>Dotknij przycisku <strong>Udostępnij</strong> na dolnym pasku Safari.</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
            <span>Wybierz <strong>Do ekranu początkowego</strong>.</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
            <span>Zatwierdź przyciskiem <strong>Dodaj</strong>.</span>
          </div>
        </div>
      )}

      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
        <Link
          href="/"
          className="text-[11px] font-medium text-slate-500 hover:text-sky-600 transition underline underline-offset-2"
        >
          Strona informacyjna
        </Link>

        {deferredPrompt ? (
          <button
            type="button"
            onClick={handleInstallClick}
            className="px-3.5 py-1.5 rounded-full bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-sm transition active:scale-95"
          >
            Dodaj do ekranu
          </button>
        ) : isIos ? (
          <button
            type="button"
            onClick={handleInstallClick}
            className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs border border-slate-200 transition"
          >
            {showIosGuide ? "Ukryj" : "Instrukcja ➔"}
          </button>
        ) : null}
      </div>
    </aside>
  );
}
