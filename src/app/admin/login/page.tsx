"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function AdminLoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const errorParam = searchParams.get("error");
  const errorUser = searchParams.get("user");
  const errorId = searchParams.get("id");
  const errorReason = searchParams.get("reason");
  const returnTo = searchParams.get("returnTo") || "/admin";

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMessage("Wprowadź hasło awaryjne.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Nieprawidłowe hasło.");
      }

      // W trybie PWA na iOS używamy window.location.href, aby wymusić pełną nawigację z ciasteczkiem
      window.location.href = returnTo;
    } catch (err: any) {
      setErrorMessage(err.message || "Błąd logowania.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 selection:bg-sky-500 selection:text-white">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8">
        {/* Nagłówek */}
        <div className="text-center mb-6">
          <div aria-hidden="true" className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 mb-3 text-2xl">
            🛡️
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Panel Moderatora GTK
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Gdzie ta koperta? &bull; Autoryzowany dostęp
          </p>
        </div>

        {/* Komunikaty błędów */}
        {errorParam === "unauthorized_osm" && (
          <div role="alert" className="mb-6 p-4 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-200 text-xs">
            <p className="font-semibold text-rose-300 flex items-center gap-1.5 mb-1 text-sm">
              <span aria-hidden="true">⛔</span> Brak uprawnień administratora
            </p>
            <p className="mb-2">
              Konto OpenStreetMap <strong className="text-white">{errorUser || "Nieznane"}</strong>
              {errorId ? ` (ID: ${errorId})` : ""} nie znajduje się na liście dozwolonych moderatorów.
            </p>
            <p className="text-[11px] text-rose-300/80">
              Dopisz swój nick lub ID do zmiennej <code className="bg-rose-900/60 px-1 py-0.5 rounded text-white font-mono">ADMIN_OSM_USERS</code> w pliku <code className="bg-rose-900/60 px-1 py-0.5 rounded text-white font-mono">.env.local</code> / Vercel.
            </p>
          </div>
        )}

        {errorParam === "osm_error" && (
          <div role="alert" className="mb-6 p-3 rounded-xl bg-amber-950/50 border border-amber-800/60 text-amber-200 text-xs">
            <span className="font-semibold">Błąd autoryzacji OSM:</span> {errorReason || "Nieznany błąd"}
          </div>
        )}

        {errorMessage && (
          <div role="alert" className="mb-6 p-3 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs">
            {errorMessage}
          </div>
        )}

        {/* Główna metoda logowania: OpenStreetMap OAuth */}
        <div className="space-y-4">
          <div>
            <a
              href="/api/admin/auth/osm/login"
              aria-label="Zaloguj się przez konto OpenStreetMap (OAuth)"
              className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-[0.98] text-white font-semibold text-sm shadow-lg shadow-sky-600/20 transition duration-150 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </svg>
              <span>Zaloguj przez OpenStreetMap</span>
            </a>
            <p className="text-[11px] text-center text-slate-500 mt-2">
              Zalecana metoda dla moderatorów (pozwala na bezpośrednią edycję OSM)
            </p>
          </div>

          {/* Separator */}
          <div className="relative my-6" aria-hidden="true">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
              <span className="bg-slate-900 px-3 text-slate-500 font-semibold">
                LUB HASŁEM AWARYJNYM
              </span>
            </div>
          </div>

          {/* Fallback hasłem ADMIN_SECRET */}
          <form onSubmit={handlePasswordLogin} className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-slate-300"
                >
                  Klucz awaryjny (ADMIN_SECRET)
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ukryj hasło" : "Pokaż hasło w postaci jawnej"}
                  className="text-[11px] text-sky-400 hover:text-sky-300 font-medium transition focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none rounded px-1"
                >
                  {showPassword ? "Ukryj" : "Pokaż"}
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Wklej klucz awaryjny..."
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 text-sm focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none transition font-mono pr-10"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-[0.98] text-white font-semibold text-xs transition shadow-md shadow-sky-600/20 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
            >
              {isSubmitting ? "Weryfikacja..." : "Zaloguj do panelu"}
            </button>
          </form>
        </div>

        {/* Link powrotny */}
        <div className="mt-8 pt-4 border-t border-slate-800/80 text-center">
          <Link
            href="/"
            className="text-xs text-slate-400 hover:text-slate-200 transition focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none rounded px-1.5 py-1"
          >
            &larr; Wróć do mapy głównej
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-xs">
          Wczytywanie...
        </div>
      }
    >
      <AdminLoginContent />
    </Suspense>
  );
}
