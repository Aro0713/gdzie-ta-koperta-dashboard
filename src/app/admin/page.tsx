"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Dynamiczny import mapy Leaflet (SSR: false)
const AdminMiniMap = dynamic(
  () => import("@/components/admin/AdminMiniMap"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[260px] bg-slate-900 flex items-center justify-center text-slate-400 text-xs rounded-xl border border-slate-800">
        Wczytywanie mapy...
      </div>
    ),
  }
);

interface SubmissionItem {
  id: string;
  source_type: string;
  local_spot_id: string;
  lat: number;
  lng: number;
  status: string;
  metadata: {
    address?: string;
    slotsCount?: string;
    notes?: string;
    photoUrl?: string;
    photoPublicId?: string;
    submittedAt?: string;
    rejectionReason?: string;
    deletePhotoAfter?: string;
    [key: string]: any;
  };
  osm_type?: string;
  osm_id?: string;
  osm_url?: string;
  submitted_at?: string;
  created_at: string;
}

interface Counts {
  pending: number;
  approved: number;
  submitted_to_osm: number;
  rejected: number;
  total: number;
}

export default function AdminDashboardPage() {
  const router = useRouter();

  // Stan danych
  const [activeTab, setActiveTab] = useState<string>("pending");
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [counts, setCounts] = useState<Counts>({
    pending: 0,
    approved: 0,
    submitted_to_osm: 0,
    rejected: 0,
    total: 0,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Widok mobilny (Master-Detail): "queue" = lista zgłoszeń, "detail" = szczegóły wybranego miejsca
  const [mobilePane, setMobilePane] = useState<"queue" | "detail">("queue");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Sesja admina
  const [adminUser, setAdminUser] = useState<{
    username: string;
    authMethod: string;
    hasOsmToken: boolean;
  } | null>(null);

  // Tryb edycji szczegółów
  const [isEditMode, setIsEditMode] = useState(false);
  const [editLat, setEditLat] = useState<number>(52.237);
  const [editLng, setEditLng] = useState<number>(21.017);
  const [editAddress, setEditAddress] = useState("");
  const [editSlots, setEditSlots] = useState("1");
  const [editNotes, setEditNotes] = useState("");

  // Modale (Lightbox i Powód Odrzucenia)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("Brak widocznej koperty lub oznaczenia");

  // 1. Pobranie sesji admina
  useEffect(() => {
    fetch("/api/admin/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        if (data.authenticated && data.user) {
          setAdminUser(data.user);
        }
      })
      .catch(() => {
        router.push("/admin/login");
      });
  }, [router]);

  // 2. Pobranie zgłoszeń dla aktywnego taba
  const fetchSubmissions = useCallback(async (tab: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/submissions?status=${tab}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Błąd serwera (${res.status})`);
      }
      const data = await res.json();
      if (data.ok) {
        setSubmissions(data.submissions || []);
        if (data.counts) {
          setCounts(data.counts);
        }
        // Ustaw domyślnie zaznaczony rekord
        if (data.submissions?.length > 0) {
          setSelectedId((prev) => {
            const exists = data.submissions.some((s: SubmissionItem) => s.id === prev);
            return exists ? prev : data.submissions[0].id;
          });
        } else {
          setSelectedId(null);
          setMobilePane("queue");
        }
      } else {
        throw new Error(data.error || "Błąd pobierania danych.");
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Nie udało się załadować zgłoszeń." });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubmissions(activeTab);
  }, [activeTab, fetchSubmissions]);

  // Zmiana zakładki
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setMobilePane("queue");
  };

  // Wybrane zgłoszenie
  const selectedItem = submissions.find((s) => s.id === selectedId) || null;
  const currentIndex = submissions.findIndex((s) => s.id === selectedId);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex !== -1 && currentIndex < submissions.length - 1;

  const goToPrev = () => {
    if (hasPrev) {
      setSelectedId(submissions[currentIndex - 1].id);
    }
  };

  const goToNext = () => {
    if (hasNext) {
      setSelectedId(submissions[currentIndex + 1].id);
    }
  };

  // Synchronizacja pól edycji przy zmianie wybranego zgłoszenia
  useEffect(() => {
    if (selectedItem) {
      setEditLat(Number(selectedItem.lat));
      setEditLng(Number(selectedItem.lng));
      setEditAddress(selectedItem.metadata?.address || "");
      setEditSlots(selectedItem.metadata?.slotsCount || "1");
      setEditNotes(selectedItem.metadata?.notes || "");
      setIsEditMode(false);
    }
  }, [selectedId, selectedItem]);

  // Przywrócenie oryginału
  const handleResetOriginal = () => {
    if (selectedItem) {
      setEditLat(Number(selectedItem.lat));
      setEditLng(Number(selectedItem.lng));
      setEditAddress(selectedItem.metadata?.address || "");
      setEditSlots(selectedItem.metadata?.slotsCount || "1");
      setEditNotes(selectedItem.metadata?.notes || "");
    }
  };

  // Akcja: Zatwierdź
  const handleApprove = async (pushToOsm = false) => {
    if (!selectedItem || isProcessing) return;
    setIsProcessing(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/admin/submissions/${selectedItem.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: editLat,
          lng: editLng,
          metadataPatch: {
            address: editAddress,
            slotsCount: editSlots,
            notes: editNotes,
          },
          pushToOsm,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Błąd zatwierdzania zgłoszenia.");
      }

      setStatusMessage({ type: "success", text: data.message });
      await fetchSubmissions(activeTab);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  // Akcja: Odrzuć (soft 14d)
  const handleRejectSoft = async () => {
    if (!selectedItem || isProcessing) return;
    setIsProcessing(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/admin/submissions/${selectedItem.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: rejectReason,
          mode: "soft_14d",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Błąd odrzucania zgłoszenia.");
      }

      setIsRejectModalOpen(false);
      setStatusMessage({ type: "success", text: data.message });
      await fetchSubmissions(activeTab);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  // Akcja: Spam / Hard Delete
  const handleHardDeleteSpam = async () => {
    if (!selectedItem || isProcessing) return;

    const confirmed = window.confirm(
      "UWAGA: Czy na pewno usunąć to zgłoszenie jako SPAM?\n\nZdjęcie zostanie natychmiast trwale skasowane z Cloudinary, a rekord usunięty z bazy!"
    );
    if (!confirmed) return;

    setIsProcessing(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/admin/submissions/${selectedItem.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Spam / treść nieodpowiednia",
          mode: "hard_spam",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Błąd usuwania spamu.");
      }

      setStatusMessage({ type: "success", text: data.message });
      await fetchSubmissions(activeTab);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  // Akcja dla problemu: Potwierdź likwidację miejsca (ukryj na mapie)
  const handleConfirmIssueRemoval = async () => {
    if (!selectedItem || isProcessing) return;

    const confirmed = window.confirm(
      "Czy na pewno potwierdzić likwidację tego miejsca?\n\nMiejsce parkingowe zostanie natychmiast ukryte na mapie dla wszystkich użytkowników."
    );
    if (!confirmed) return;

    setIsProcessing(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/admin/submissions/${selectedItem.id}/confirm-issue`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Błąd potwierdzania likwidacji.");
      }

      setStatusMessage({ type: "success", text: data.message });
      await fetchSubmissions(activeTab);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  // Akcja dla problemu: Odrzuć uwagę (miejsce istnieje w rzeczywistości)
  const handleDismissIssue = async () => {
    if (!selectedItem || isProcessing) return;

    setIsProcessing(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/admin/submissions/${selectedItem.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Zgłoszenie odrzucone - miejsce parkingowe istnieje i jest dostępne",
          mode: "soft_14d",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Błąd odrzucania zgłoszenia.");
      }

      setStatusMessage({
        type: "success",
        text: "Zgłoszenie problemu zostało odrzucone. Miejsce pozostaje aktywne na mapie.",
      });
      await fetchSubmissions(activeTab);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  // Akcja: Ręczne czyszczenie wygasłych zdjęć
  const handleManualCleanup = async () => {
    try {
      const res = await fetch("/api/admin/cleanup", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        alert(data.message || `Wyczyszczono ${data.purgedCount} zdjęć.`);
      } else {
        alert("Błąd czyszczenia: " + data.error);
      }
    } catch {
      alert("Błąd sieci podczas czyszczenia.");
    }
  };

  // Wylogowanie
  const handleLogout = async () => {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  };

  // Obsługa skrótów klawiszowych (Z, S, O, E)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement?.tagName.toLowerCase();
      if (activeEl === "input" || activeEl === "textarea" || isRejectModalOpen || lightboxUrl) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "e") {
        e.preventDefault();
        setIsEditMode((prev) => !prev);
      } else if (key === "z") {
        e.preventDefault();
        handleApprove(false);
      } else if (key === "s") {
        e.preventDefault();
        if (adminUser?.hasOsmToken) {
          handleApprove(true);
        }
      } else if (key === "o") {
        e.preventDefault();
        setIsRejectModalOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [adminUser, handleApprove, isRejectModalOpen, lightboxUrl]);

  return (
    <div className="h-screen h-[100dvh] bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden selection:bg-sky-500 selection:text-white">
      {/* 1. GÓRNY PASEK NAWIGACJI (Jednoliniowy, zoptymalizowany pod iPhone notch i Safe Areas) */}
      <header
        className="bg-slate-900 border-b border-slate-800 px-4 shrink-0 flex items-center justify-between"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))",
          paddingBottom: "0.75rem",
        }}
      >
        {/* Lewa strona: Logo + Rola */}
        <div className="flex items-center gap-2.5">
          <Link
            href="/"
            aria-label="Strona główna Gdzie Ta Koperta"
            className="flex items-center gap-2 hover:opacity-85 transition active:scale-95 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none rounded-lg p-1"
          >
            <span aria-hidden="true" className="text-xl">♿</span>
            <span className="font-bold text-sm tracking-tight text-white">
              Gdzie ta koperta?
            </span>
          </Link>
          <span className="text-xs text-sky-400 font-bold uppercase tracking-wider hidden sm:inline-block">
            Moderator
          </span>
        </div>

        {/* Prawa strona (Desktop): Profil, Sprzątanie, Mapa i Wyloguj */}
        <div className="hidden md:flex items-center gap-2 text-xs">
          {adminUser && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700/80 text-slate-200">
              {adminUser.authMethod === "osm" ? (
                <>
                  <span className="text-emerald-400 font-bold">🌐 OSM:</span>
                  <span className="font-semibold text-white">{adminUser.username}</span>
                </>
              ) : (
                <>
                  <span aria-hidden="true" className="text-amber-400">🔑</span>
                  <span className="font-semibold text-amber-200">Klucz awaryjny</span>
                </>
              )}
            </span>
          )}

          <button
            type="button"
            onClick={handleManualCleanup}
            aria-label="Wyczyść z Cloudinary zdjęcia zgłoszeń odrzuconych ponad 14 dni temu"
            title="Usuń z Cloudinary zdjęcia zgłoszeń odrzuconych ponad 14 dni temu"
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition font-medium border border-slate-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
          >
            <span aria-hidden="true">🧹</span> Sprzątnij &gt;14d
          </button>

          <Link
            href="/"
            aria-label="Przejdź do mapy głównej"
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition font-medium border border-slate-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
          >
            <span aria-hidden="true">🗺️</span> Mapa główna
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            aria-label="Wyloguj się z panelu moderatora"
            className="px-3 py-1.5 rounded-xl bg-rose-950/70 hover:bg-rose-900 text-rose-300 hover:text-white transition font-semibold border border-rose-800/80 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
          >
            Wyloguj
          </button>
        </div>

        {/* Prawa strona (Mobilka): Hamburger Button */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 active:scale-95 transition flex items-center justify-center focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
            aria-label="Otwórz menu moderatora"
            aria-expanded={isMobileMenuOpen}
            aria-controls="admin-mobile-drawer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* 2. POZIOMY PASEK FILTRÓW / ZAKŁADEK (Płynne przewijanie kciukiem bez łamania wierszy) */}
      <nav aria-label="Kategorie zgłoszeń" className="bg-slate-900/90 border-b border-slate-800 px-3 py-2 shrink-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div role="tablist" className="flex items-center gap-1.5 min-w-max">
          {/* Tab: Do weryfikacji */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "pending"}
            aria-label={`Zgłoszenia do weryfikacji, liczba: ${counts.pending}`}
            onClick={() => handleTabChange("pending")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-2 shrink-0 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none ${
              activeTab === "pending"
                ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-bold"
                : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700"
            }`}
          >
            <span>Do weryfikacji</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === "pending"
                  ? "bg-slate-950 text-amber-300"
                  : "bg-slate-800 text-amber-400"
              }`}
            >
              {counts.pending}
            </span>
          </button>

          {/* Tab: Zatwierdzone */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "approved"}
            aria-label={`Zgłoszenia zatwierdzone, liczba: ${counts.approved}`}
            onClick={() => handleTabChange("approved")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-2 shrink-0 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none ${
              activeTab === "approved"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20 font-bold"
                : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700"
            }`}
          >
            <span>Zatwierdzone</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === "approved"
                  ? "bg-emerald-950 text-emerald-200"
                  : "bg-slate-800 text-emerald-400"
              }`}
            >
              {counts.approved}
            </span>
          </button>

          {/* Tab: Wysłane do OSM */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "submitted_to_osm"}
            aria-label={`Zgłoszenia wysłane do OpenStreetMap, liczba: ${counts.submitted_to_osm}`}
            onClick={() => handleTabChange("submitted_to_osm")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-2 shrink-0 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none ${
              activeTab === "submitted_to_osm"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/20 font-bold"
                : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700"
            }`}
          >
            <span>Wysłane do OSM</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === "submitted_to_osm"
                  ? "bg-sky-950 text-sky-200"
                  : "bg-slate-800 text-sky-400"
              }`}
            >
              {counts.submitted_to_osm}
            </span>
          </button>

          {/* Tab: Odrzucone */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "rejected"}
            aria-label={`Zgłoszenia odrzucone, liczba: ${counts.rejected}`}
            onClick={() => handleTabChange("rejected")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-2 shrink-0 focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none ${
              activeTab === "rejected"
                ? "bg-rose-700 text-white shadow-md shadow-rose-700/20 font-bold"
                : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700"
            }`}
          >
            <span>Odrzucone</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === "rejected"
                  ? "bg-rose-950 text-rose-200"
                  : "bg-slate-800 text-rose-400"
              }`}
            >
              {counts.rejected}
            </span>
          </button>

          {/* Tab: Wszystkie */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "all"}
            aria-label={`Wszystkie zgłoszenia, łącznie: ${counts.total}`}
            onClick={() => handleTabChange("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-2 shrink-0 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none ${
              activeTab === "all"
                ? "bg-slate-700 text-white shadow-md font-bold"
                : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700"
            }`}
          >
            <span>Wszystkie</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === "all"
                  ? "bg-slate-900 text-slate-200"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {counts.total}
            </span>
          </button>
        </div>
      </nav>

      {/* Komunikat o akcji (Toast) */}
      {statusMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`py-2 px-4 text-xs font-semibold text-center flex items-center justify-center gap-2 shrink-0 ${
            statusMessage.type === "success"
              ? "bg-emerald-950/90 border-b border-emerald-800 text-emerald-200"
              : "bg-rose-950/90 border-b border-rose-800 text-rose-200"
          }`}
        >
          <span aria-hidden="true">{statusMessage.type === "success" ? "✔" : "✖"}</span>
          <span>{statusMessage.text}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            aria-label="Zamknij powiadomienie"
            className="ml-3 underline opacity-80 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none rounded px-1"
          >
            zamknij
          </button>
        </div>
      )}

      {/* 3. GŁÓWNY WIDOK: MASTER-DETAIL (Na telefonie lista lub detale, na desktopie split-screen) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* LEWA KOLUMNA: KOLEJKA ZGŁOSZEŃ */}
        <aside
          className={`w-full md:w-80 lg:w-96 border-r border-slate-800 flex flex-col shrink-0 bg-slate-900/40 ${
            mobilePane === "queue" ? "flex" : "hidden md:flex"
          }`}
        >
          {/* Nagłówek kolejki z licznikiem i manualnym odświeżaniem */}
          <div className="p-3 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300 bg-slate-900/80">
            <div className="flex items-center gap-2">
              <span className="font-bold uppercase tracking-wider text-[11px] text-slate-200">
                Kolejka ({submissions.length})
              </span>
              <button
                type="button"
                onClick={() => fetchSubmissions(activeTab)}
                disabled={isLoading}
                aria-label="Odśwież listę zgłoszeń"
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-sky-400 transition focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
                title="Odśwież listę zgłoszeń"
              >
                <span aria-hidden="true" className={isLoading ? "animate-spin inline-block text-xs" : "text-xs"}>🔄</span>
              </button>
            </div>
            <span className="text-[11px] text-slate-400">Sortowanie: Najnowsze</span>
          </div>

          {/* Lista zgłoszeń */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Wczytywanie listy...
              </div>
            ) : submissions.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Brak zgłoszeń w tej kategorii 🎉
              </div>
            ) : (
              submissions.map((item) => {
                const isSelected = item.id === selectedId;
                const photoUrl = item.metadata?.photoUrl;
                const dateStr = item.created_at
                  ? new Date(item.created_at).toLocaleString("pl-PL", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "";

                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={isSelected ? "true" : undefined}
                    aria-label={`Zgłoszenie: ${item.metadata?.address || "Brak adresu"}, status: ${item.status}`}
                    onClick={() => {
                      setSelectedId(item.id);
                      setMobilePane("detail");
                    }}
                    className={`w-full text-left p-3.5 transition flex gap-3 items-start relative focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none ${
                      isSelected
                        ? "bg-slate-800 border-l-4 border-l-sky-500 shadow-inner"
                        : "hover:bg-slate-800/50"
                    }`}
                  >
                    {/* Miniaturka zdjęcia */}
                    <div className="w-14 h-14 rounded-lg bg-slate-950 border border-slate-800 shrink-0 overflow-hidden relative flex items-center justify-center shadow-sm">
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt="Miniaturka zgłoszenia"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span aria-hidden="true" className="text-xl opacity-40">🅿️</span>
                      )}
                    </div>

                    {/* Treść zgłoszenia */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-xs font-bold text-white truncate">
                          {item.metadata?.address || "Brak nazwy/adresu"}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {dateStr}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-300 line-clamp-1 mb-1.5">
                        {item.metadata?.notes || "Brak opisu"}
                      </p>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.source_type === "issue_report" || item.metadata?.type === "issue_report" ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/25 text-rose-300 border border-rose-500/50 font-bold flex items-center gap-1">
                            <span aria-hidden="true">⚠️</span>
                            <span>{item.metadata?.issueCategoryLabel || "Zgłoszony problem"}</span>
                          </span>
                        ) : item.status === "pending_verification" || item.status === "pending" ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                            Oczekujące
                          </span>
                        ) : item.status === "approved" ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                            Zatwierdzone
                          </span>
                        ) : item.status === "submitted_to_osm" ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold">
                            W OSM
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold">
                            Odrzucone
                          </span>
                        )}

                        <span className="text-[10px] text-slate-400 font-mono">
                          {Number(item.lat).toFixed(4)}, {Number(item.lng).toFixed(4)}
                        </span>
                      </div>
                    </div>

                    {/* Chevron na mobilce wskazujący wejście w detale */}
                    <div aria-hidden="true" className="md:hidden text-slate-500 self-center pl-1 text-sm font-bold">
                      ›
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* PRAWA KOLUMNA: SZCZEGÓŁY WYBRANEGO ZGŁOSZENIA */}
        <main
          className={`flex-1 flex flex-col bg-slate-950 overflow-y-auto ${
            mobilePane === "detail" ? "flex" : "hidden md:flex"
          }`}
        >
          {!selectedItem ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400 text-center">
              <span aria-hidden="true" className="text-4xl mb-3">📋</span>
              <p className="text-sm font-medium">
                Wybierz zgłoszenie z lewej listy, aby przejść do moderacji.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between">
              <div>
                {/* Pasek nawigacyjny Master-Detail na telefonie */}
                <div className="md:hidden sticky top-0 z-20 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setMobilePane("queue")}
                    aria-label="Wróć do listy kolejki zgłoszeń"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700 active:scale-95 transition focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
                  >
                    <span aria-hidden="true">←</span>
                    <span>Wróć do kolejki</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {currentIndex !== -1 && (
                      <span className="text-[11px] text-slate-300 font-mono">
                        {currentIndex + 1} z {submissions.length}
                      </span>
                    )}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={goToPrev}
                        disabled={!hasPrev}
                        aria-label="Poprzednie zgłoszenie w kolejce"
                        className="p-1.5 rounded-lg bg-slate-800 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold active:scale-90 transition focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
                        title="Poprzednie zgłoszenie"
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        onClick={goToNext}
                        disabled={!hasNext}
                        aria-label="Następne zgłoszenie w kolejce"
                        className="p-1.5 rounded-lg bg-slate-800 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold active:scale-90 transition focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
                        title="Następne zgłoszenie"
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                </div>

                {/* Ostrzeżenie jeśli zgłoszenie dotyczy problemu / likwidacji miejsca */}
                {(selectedItem.source_type === "issue_report" || selectedItem.metadata?.type === "issue_report") && (
                  <div className="p-4 bg-rose-950/40 border-b border-rose-800/70 text-rose-200">
                    <div className="flex items-center gap-2 font-bold text-sm text-rose-300 mb-1.5">
                      <span>⚠️</span>
                      <span>Użytkownik zgłosił problem z tą kopertą:</span>
                    </div>
                    <div className="text-xs space-y-1">
                      <div>
                        <strong className="text-white">Kategoria problemu:</strong>{" "}
                        <span className="font-semibold text-rose-200">
                          {selectedItem.metadata?.issueCategoryLabel || selectedItem.metadata?.issueCategory || "Zgłoszenie błędu"}
                        </span>
                      </div>
                      {selectedItem.metadata?.notes && (
                        <div>
                          <strong className="text-white">Opis użytkownika:</strong>{" "}
                          <span>{selectedItem.metadata.notes}</span>
                        </div>
                      )}
                      {selectedItem.local_spot_id && (
                        <div className="text-[11px] text-rose-400/80 font-mono pt-0.5">
                          Dotyczy ID: {selectedItem.local_spot_id}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Sekcja Mediów i Mapy (Góra) */}
                <div className="p-4 sm:p-6 border-b border-slate-800 grid grid-cols-1 lg:grid-cols-2 gap-4 bg-slate-900/30">
                  {/* 1. Zdjęcie zgłoszenia */}
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                        <span aria-hidden="true">📸</span> Zdjęcie koperty
                      </span>
                      {selectedItem.metadata?.photoUrl && (
                        <button
                          type="button"
                          onClick={() => setLightboxUrl(selectedItem.metadata.photoUrl!)}
                          aria-label="Powiększ zdjęcie zgłoszenia w pełnym oknie"
                          className="text-xs text-sky-400 hover:text-sky-300 font-semibold underline flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none rounded px-1"
                        >
                          <span aria-hidden="true">🔍</span> Powiększ
                        </button>
                      )}
                    </div>

                    <div className="w-full h-64 sm:h-72 rounded-xl bg-slate-900 border border-slate-800 overflow-hidden relative flex items-center justify-center group shadow-md">
                      {selectedItem.metadata?.photoUrl ? (
                        <img
                          src={selectedItem.metadata.photoUrl}
                          alt="Zdjęcie koperty zgłoszonej przez użytkownika"
                          onClick={() => setLightboxUrl(selectedItem.metadata.photoUrl!)}
                          className="w-full h-full object-cover cursor-zoom-in group-hover:scale-105 transition duration-300"
                        />
                      ) : (
                        <div className="text-center p-4 text-slate-500 text-xs">
                          <span aria-hidden="true" className="text-3xl block mb-2 opacity-50">📷</span>
                          Zgłoszenie bez dołączonego zdjęcia
                        </div>
                      )}

                      {selectedItem.metadata?.deletePhotoAfter && (
                        <div className="absolute bottom-2 left-2 right-2 p-2 rounded-lg bg-rose-950/90 text-rose-200 border border-rose-800 text-[10px] backdrop-blur-md">
                          ⚠️ Zdjęcie zaplanowane do usunięcia:{" "}
                          {new Date(selectedItem.metadata.deletePhotoAfter).toLocaleDateString("pl-PL")}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 2. Mini-mapa Leaflet */}
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                        <span aria-hidden="true">📍</span> Położenie na mapie
                      </span>
                      <button
                        type="button"
                        aria-pressed={isEditMode}
                        aria-label={isEditMode ? "Zablokuj edycję pozycji" : "Włącz edycję pozycji na mapie"}
                        onClick={() => setIsEditMode((prev) => !prev)}
                        className={`text-xs font-bold px-3 py-1 rounded-lg transition border flex items-center gap-1 active:scale-95 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none ${
                          isEditMode
                            ? "bg-amber-500 text-slate-950 border-amber-400"
                            : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
                        }`}
                      >
                        <span>{isEditMode ? "🔒 Zablokuj [E]" : "✏️ Edytuj pozycję [E]"}</span>
                      </button>
                    </div>

                    <div className="w-full h-64 sm:h-72 rounded-xl overflow-hidden shadow-md border border-slate-800 isolate relative z-0">
                      <AdminMiniMap
                        lat={editLat}
                        lng={editLng}
                        isEditMode={isEditMode}
                        onCoordsChange={(pos) => {
                          setEditLat(pos.lat);
                          setEditLng(pos.lng);
                        }}
                      />
                    </div>
                    {isEditMode && (
                      <p className="text-[11px] text-amber-300 mt-2 flex items-center gap-1 font-medium">
                        <span aria-hidden="true">💡</span> Kliknij w mapę lub przeciągnij pinezkę, aby skorygować pozycję koperty.
                      </p>
                    )}
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <a
                        href={`/?lat=${editLat}&lng=${editLng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Zobacz tę kopertę na mapie publicznej (otwiera w nowej karcie)"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
                      >
                        <span aria-hidden="true">🗺️</span> Zobacz tę kopertę na mapie publicznej ↗
                      </a>
                    </div>
                  </div>
                </div>

                {/* Sekcja Pól Formularza / Metadanych */}
                <div className="p-4 sm:p-6 space-y-4 pb-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Metadane zgłoszenia</span>
                      <span className="text-xs font-mono font-normal text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                        ID: {selectedItem.id}
                      </span>
                    </h3>
                    {isEditMode && (
                      <button
                        type="button"
                        onClick={handleResetOriginal}
                        aria-label="Przywróć pierwotne współrzędne i dane zgłoszenia"
                        className="text-xs text-amber-400 hover:text-amber-300 font-semibold underline focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none rounded px-1"
                      >
                        Przywróć pierwotne
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Szerokość / Długość GPS */}
                    <div>
                      <label htmlFor="admin-edit-lat" className="block text-xs font-semibold text-slate-300 mb-1">
                        Szerokość (Lat)
                      </label>
                      <input
                        id="admin-edit-lat"
                        type="number"
                        step="any"
                        value={editLat}
                        onChange={(e) => setEditLat(parseFloat(e.target.value))}
                        disabled={!isEditMode}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-white text-xs font-mono disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
                      />
                    </div>

                    <div>
                      <label htmlFor="admin-edit-lng" className="block text-xs font-semibold text-slate-300 mb-1">
                        Długość (Lng)
                      </label>
                      <input
                        id="admin-edit-lng"
                        type="number"
                        step="any"
                        value={editLng}
                        onChange={(e) => setEditLng(parseFloat(e.target.value))}
                        disabled={!isEditMode}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-white text-xs font-mono disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
                      />
                    </div>

                    {/* Liczba stanowisk */}
                    <div>
                      <label htmlFor="admin-edit-slots" className="block text-xs font-semibold text-slate-300 mb-1">
                        Liczba miejsc (kopert)
                      </label>
                      <input
                        id="admin-edit-slots"
                        type="number"
                        min="1"
                        value={editSlots}
                        onChange={(e) => setEditSlots(e.target.value)}
                        disabled={!isEditMode}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-white text-xs font-mono disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
                      />
                    </div>

                    {/* Status obecny */}
                    <div>
                      <label htmlFor="admin-edit-status" className="block text-xs font-semibold text-slate-300 mb-1">
                        Status w bazie
                      </label>
                      <input
                        id="admin-edit-status"
                        type="text"
                        value={selectedItem.status}
                        disabled
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-slate-300 text-xs font-mono disabled:opacity-60"
                      />
                    </div>
                  </div>

                  {/* Adres */}
                  <div>
                    <label htmlFor="admin-edit-address" className="block text-xs font-semibold text-slate-300 mb-1">
                      Adres / lokalizacja
                    </label>
                    <input
                      id="admin-edit-address"
                      type="text"
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      disabled={!isEditMode}
                      placeholder="np. ul. Marszałkowska 10, Warszawa"
                      className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-white text-xs disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
                    />
                  </div>

                  {/* Notatka */}
                  <div>
                    <label htmlFor="admin-edit-notes" className="block text-xs font-semibold text-slate-300 mb-1">
                      Uwagi zgłaszającego
                    </label>
                    <textarea
                      id="admin-edit-notes"
                      rows={2}
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      disabled={!isEditMode}
                      placeholder="Brak dodatkowych uwag"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-white text-xs disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
                    />
                  </div>

                  {/* Szczegóły odrzucenia jeśli obecne */}
                  {selectedItem.metadata?.rejectionReason && (
                    <div className="p-3.5 bg-rose-950/40 border border-rose-800 rounded-xl text-xs text-rose-200">
                      <p className="font-bold mb-1">Powód odrzucenia:</p>
                      <p>{selectedItem.metadata.rejectionReason}</p>
                      {selectedItem.metadata.rejectedBy && (
                        <p className="text-[10px] text-rose-300/80 mt-1">
                          Odrzucone przez: {selectedItem.metadata.rejectedBy}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 4. PASEK AKCJI DLA MODERATORA (Zwykły na dole strony) */}
              <div className="border-t border-slate-800 bg-slate-900/95 p-4 sm:p-6 shrink-0 mt-4">
                {/* Na desktopie wskazówki skrótów klawiszowych */}
                <div className="hidden xl:flex items-center gap-3 text-[11px] text-slate-400 font-mono mb-2.5">
                  <span>Skróty klawiszowe:</span>
                  <span className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-slate-200">[Z] Zatwierdź</span>
                  <span className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-slate-200">[S] Do OSM</span>
                  <span className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-slate-200">[O] Odrzuć</span>
                  <span className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-slate-200">[E] Edytuj</span>
                </div>

                {/* Przyciski operacyjne */}
                {selectedItem.source_type === "issue_report" || selectedItem.metadata?.type === "issue_report" ? (
                  /* Tryb zgłoszenia problemu / likwidacji miejsca */
                  <div className="grid grid-cols-1 sm:flex sm:items-center sm:justify-end gap-2.5">
                    {/* 1. Potwierdź likwidację miejsca (ukryj z mapy) */}
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={handleConfirmIssueRemoval}
                      aria-label="Potwierdź likwidację miejsca i ukryj je z mapy publicznej"
                      className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold text-xs shadow-md shadow-rose-600/30 transition disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[44px] focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
                    >
                      <span aria-hidden="true">🚫</span>
                      <span>Potwierdź likwidację (Ukryj z mapy)</span>
                    </button>

                    {/* 2. Odrzuć uwagę (miejsce istnieje w rzeczywistości) */}
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={handleDismissIssue}
                      aria-label="Odrzuć uwagę zgłaszającego, potwierdzając że miejsce istnieje w rzeczywistości"
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[44px] focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
                    >
                      <span aria-hidden="true">✔</span>
                      <span>Odrzuć uwagę (Miejsce istnieje)</span>
                    </button>

                    {/* 3. Spam */}
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={handleHardDeleteSpam}
                      aria-label="Usuń to zgłoszenie jako spam"
                      className="px-3.5 py-2.5 rounded-xl bg-rose-950 hover:bg-rose-900 active:scale-95 text-rose-200 hover:text-white font-bold text-xs border border-rose-800 transition disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[44px] focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
                    >
                      <span aria-hidden="true">🗑️</span>
                      <span>Spam</span>
                    </button>
                  </div>
                ) : (
                  /* Standardowe przyciski nowego zgłoszenia: 2x2 na mobilce, 4 w rzędzie na desktopie */
                  <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2.5">
                    {/* 1. Zatwierdź w aplikacji */}
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleApprove(false)}
                      aria-label="Zatwierdź miejsce w aplikacji lokalnej"
                      className="px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[44px] focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
                    >
                      <span aria-hidden="true">✔</span>
                      <span>Zatwierdź <span className="hidden sm:inline">[Z]</span></span>
                    </button>

                    {/* 2. Zatwierdź i wyślij do OSM */}
                    <button
                      type="button"
                      disabled={isProcessing || !adminUser?.hasOsmToken}
                      onClick={() => handleApprove(true)}
                      aria-label="Zatwierdź miejsce w aplikacji oraz wyślij węzeł do OpenStreetMap"
                      title={
                        adminUser?.hasOsmToken
                          ? "Zatwierdź lokalnie i utwórz węzeł w OpenStreetMap"
                          : "Zaloguj się kontem OSM, aby włączyć wysyłkę do mapy"
                      }
                      className={`px-3 py-2.5 rounded-xl text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 min-h-[44px] focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none ${
                        adminUser?.hasOsmToken
                          ? "bg-sky-600 hover:bg-sky-500 active:scale-95 shadow-sky-600/20"
                          : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                      }`}
                    >
                      <span aria-hidden="true">🌐</span>
                      <span>Do OSM <span className="hidden sm:inline">[S]</span></span>
                    </button>

                    {/* 3. Odrzuć (retencja 14 dni) */}
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setIsRejectModalOpen(true)}
                      aria-label="Odrzuć zgłoszenie z określeniem powodu"
                      className="px-3 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-bold text-xs border border-amber-500/50 transition disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[44px] focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                    >
                      <span aria-hidden="true">⚠️</span>
                      <span>Odrzuć <span className="hidden sm:inline">[O]</span></span>
                    </button>

                    {/* 4. Spam / Hard Delete */}
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={handleHardDeleteSpam}
                      aria-label="Usuń to zgłoszenie jako spam"
                      className="px-3 py-2.5 rounded-xl bg-rose-950 hover:bg-rose-900 active:scale-95 text-rose-200 hover:text-white font-bold text-xs border border-rose-800 transition disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[44px] focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
                    >
                      <span aria-hidden="true">🗑️</span>
                      <span>Spam</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* 5. DRAWER / HAMBURGER MENU DLA MOBILKI */}
      {isMobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100000] md:hidden transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div
            id="admin-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu moderatora"
            className="admin-drawer fixed top-0 right-0 bottom-0 w-80 max-w-[85vw] bg-slate-900 border-l border-slate-800 z-[100001] md:hidden flex flex-col p-5 shadow-2xl overflow-y-auto"
            style={{
              paddingTop: "max(1.25rem, env(safe-area-inset-top, 1.25rem))",
              paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 1.25rem))",
            }}
          >
            {/* Nagłówek Drawera */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="text-xl">🛡️</span>
                <span className="font-bold text-sm text-white">Menu moderatora</span>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
                aria-label="Zamknij menu moderatora"
              >
                ✕
              </button>
            </div>

            {/* Profil moderatora */}
            <div className="py-4 border-b border-slate-800">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
                Zalogowane konto
              </div>
              {adminUser ? (
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="text-base">{adminUser.authMethod === "osm" ? "🌐" : "🔑"}</span>
                    <div>
                      <div className="text-xs font-bold text-white">
                        {adminUser.authMethod === "osm" ? adminUser.username : "Klucz awaryjny"}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {adminUser.authMethod === "osm" ? "OpenStreetMap OAuth" : "ADMIN_SECRET"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400">Weryfikacja sesji...</div>
              )}
            </div>

            {/* Statystyki podsumowujące */}
            <div className="py-4 border-b border-slate-800 space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
                Stan zgłoszeń
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="text-[10px] text-amber-400 font-medium">Do weryfikacji</div>
                  <div className="text-base font-bold text-amber-300">{counts.pending}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-[10px] text-emerald-400 font-medium">Zatwierdzone</div>
                  <div className="text-base font-bold text-emerald-300">{counts.approved}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20">
                  <div className="text-[10px] text-sky-400 font-medium">W OSM</div>
                  <div className="text-base font-bold text-sky-300">{counts.submitted_to_osm}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <div className="text-[10px] text-rose-400 font-medium">Odrzucone</div>
                  <div className="text-base font-bold text-rose-300">{counts.rejected}</div>
                </div>
              </div>
            </div>

            {/* Działania i nawigacja */}
            <div className="py-4 space-y-2.5 flex-1">
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleManualCleanup();
                }}
                aria-label="Wyczyść zdjęcia z Cloudinary starsze niż 14 dni"
                className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 flex items-center gap-2.5 active:scale-95 transition focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
              >
                <span aria-hidden="true">🧹</span>
                <span>Wyczyść zdjęcia &gt;14 dni</span>
              </button>

              <Link
                href="/"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Przejdź do głównej mapy publicznej"
                className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 flex items-center gap-2.5 active:scale-95 transition focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
              >
                <span aria-hidden="true">🗺️</span>
                <span>Otwórz mapę publiczną</span>
              </Link>
            </div>

            {/* Wyloguj */}
            <div className="pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Wyloguj się z panelu moderatora"
                className="w-full p-3 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-200 font-bold text-xs border border-rose-800 flex items-center justify-center gap-2 active:scale-95 transition focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
              >
                <span aria-hidden="true">🚪</span>
                <span>Wyloguj się z panelu</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* 6. MODAL: LIGHTBOX DO ZDJĘCIA */}
      {lightboxUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Powiększone zdjęcie zgłoszenia"
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-[1200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div className="relative max-w-5xl max-h-[90vh]">
            <img
              src={lightboxUrl}
              alt="Powiększone zdjęcie koperty"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-slate-800"
            />
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              aria-label="Zamknij powiększenie zdjęcia"
              className="absolute top-4 right-4 bg-slate-900/80 hover:bg-slate-800 text-white w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold border border-slate-700 shadow focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 7. MODAL: WYBÓR POWODU ODRZUCENIA */}
      {isRejectModalOpen && selectedItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-modal-title"
          className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h3 id="reject-modal-title" className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <span aria-hidden="true">⚠️</span> Odrzucenie zgłoszenia
            </h3>
            <p className="text-xs text-slate-300 mb-4">
              Zdjęcie zostanie zachowane w Cloudinary przez <strong>14 dni</strong> na wypadek odwołania, a następnie automatycznie usunięte.
            </p>

            <div className="space-y-3 mb-6">
              <label id="reject-reasons-group-label" className="block text-xs font-semibold text-slate-200">
                Wybierz powód odrzucenia:
              </label>

              <div role="group" aria-labelledby="reject-reasons-group-label" className="space-y-2">
                {[
                  "Brak widocznej koperty lub oznaczenia P-24",
                  "Błędna lub niejednoznaczna lokalizacja",
                  "Zdjęcie nieczytelne / rozmazane",
                  "Miejsce na terenie zamkniętym bez dostępu publicznego",
                  "Duplikat istniejącego miejsca",
                ].map((reasonOption) => (
                  <button
                    key={reasonOption}
                    type="button"
                    aria-pressed={rejectReason === reasonOption}
                    aria-label={`Powód: ${reasonOption}`}
                    onClick={() => setRejectReason(reasonOption)}
                    className={`w-full text-left p-2.5 rounded-xl text-xs transition border focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none ${
                      rejectReason === reasonOption
                        ? "bg-amber-500/20 border-amber-500 text-amber-200 font-bold"
                        : "bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800/60"
                    }`}
                  >
                    {reasonOption}
                  </button>
                ))}
              </div>

              <textarea
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Inny powód..."
                aria-label="Własny powód odrzucenia zgłoszenia"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsRejectModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none"
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleRejectSoft}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none"
              >
                {isProcessing ? "Odrzucanie..." : "Zatwierdź odrzucenie"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
