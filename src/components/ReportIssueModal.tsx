"use client";

import React, { useState } from "react";
import type { SpotDetail } from "@/components/NavigationActionSheet";
import { compressImage } from "@/lib/imageCompression";
import { useSwipeDownDismiss } from "@/hooks/useSwipeDownDismiss";

interface ReportIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  spot: SpotDetail | null;
  onSuccess?: () => void;
}

const ISSUE_CATEGORIES = [
  { id: "removed", icon: "🚫", label: "Zlikwidowana / brak" },
  { id: "construction", icon: "🚧", label: "Remont / brak dojazdu" },
  { id: "private_property", icon: "⛔", label: "Teren prywatny / szlaban" },
  { id: "damaged_sign", icon: "⚠️", label: "Zniszczony znak / linie" },
  { id: "other", icon: "💬", label: "Inny problem" },
];

export function ReportIssueModal({
  isOpen,
  onClose,
  spot,
  onSuccess,
}: ReportIssueModalProps) {
  const [selectedCategory, setSelectedCategory] = useState("removed");
  const [notes, setNotes] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 220);
  };

  const { bindDragArea, sheetStyle } = useSwipeDownDismiss({
    onDismiss: handleClose,
    threshold: 70,
  });

  if (!isOpen || !spot) return null;

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const compressed = await compressImage(file);
      setPhotoFile(compressed);
      setPhotoPreview(URL.createObjectURL(compressed));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const categoryObj = ISSUE_CATEGORIES.find((c) => c.id === selectedCategory);
    const categoryLabel = categoryObj ? categoryObj.label : "Zgłoszenie uwagi";

    try {
      const formData = new FormData();
      formData.append("spotId", String(spot.id));
      formData.append("lat", String(spot.lat));
      formData.append("lng", String(spot.lng));
      formData.append("spotName", spot.name || spot.address || "Koperta parkingowa");
      if (spot.address) formData.append("address", spot.address);
      formData.append("issueCategory", selectedCategory);
      formData.append("issueCategoryLabel", categoryLabel);
      if (notes.trim()) formData.append("notes", notes.trim());
      if (photoFile) formData.append("photo", photoFile);

      const res = await fetch("/api/spots/report-issue", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Nie udało się zapisać zgłoszenia.");
      }

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || "Wystąpił błąd podczas wysyłania. Spróbuj ponownie.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[1200] flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-sm gtk-sheet-backdrop p-0 sm:p-4 overflow-y-auto ${
        isClosing ? "gtk-sheet-closing" : ""
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top, 0px))",
        paddingBottom: "max(0px, env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-issue-title"
        className={`gtk-sheet-content w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-0 sm:my-auto ${
          isClosing ? "gtk-sheet-closing" : ""
        }`}
        style={sheetStyle}
      >
        {/* Uchwyt dla mobilki (Swipe-down to dismiss) */}
        <div
          {...bindDragArea}
          className="w-full pt-3 pb-2 touch-none select-none cursor-grab active:cursor-grabbing flex justify-center"
        >
          <div className="w-12 h-1.5 bg-slate-300 rounded-full hover:bg-slate-400 transition" />
        </div>

        {/* Nagłówek modala */}
        <div className="px-5 pt-1 pb-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0 flex-1" {...bindDragArea}>
            <span aria-hidden="true" className="text-xl shrink-0">⚠️</span>
            <div className="min-w-0">
              <h3 id="report-issue-title" className="font-bold text-sm tracking-tight">Zgłoś problem z kopertą</h3>
              <p className="text-[11px] text-slate-300 truncate">
                {spot.address || spot.name || `${spot.lat.toFixed(4)}, ${spot.lng.toFixed(4)}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Zamknij"
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition shrink-0 font-bold text-xs ml-2 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
          >
            ✕
          </button>
        </div>

        {/* Formularz */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-slate-800 overflow-x-hidden w-full max-w-full">
          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {errorMessage}
            </div>
          )}

          {isSuccess ? (
            <div role="status" aria-live="polite" className="py-6 text-center space-y-2">
              <div aria-hidden="true" className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                ✔
              </div>
              <p className="text-base font-bold text-slate-900">Dziękujemy za zgłoszenie!</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Moderator zweryfikuje zgłoszenie i zaktualizuje mapę, żeby inni kierowcy nie jechali na darmo.
              </p>
            </div>
          ) : (
            <>
              {/* Wybór kategorii problemu: kompaktowa siatka 2 kolumny */}
              <div>
                <label id="issue-category-label" className="block text-xs font-bold text-slate-700 mb-2">
                  Co stało się z tym miejscem?
                </label>
                <div role="group" aria-labelledby="issue-category-label" className="grid grid-cols-2 gap-2">
                  {ISSUE_CATEGORIES.map((cat) => {
                    const isSelected = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={`Kategoria problemu: ${cat.label}`}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition active:scale-95 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none ${
                          isSelected
                            ? "bg-amber-500 text-slate-950 border-amber-500 font-bold shadow-sm"
                            : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold"
                        }`}
                      >
                        <span aria-hidden="true" className="text-base shrink-0">{cat.icon}</span>
                        <span className="text-xs leading-tight line-clamp-2">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Uwagi i zdjęcie */}
              <div className="space-y-3 pt-1">
                <div>
                  <label htmlFor="issue-notes-input" className="block text-xs font-bold text-slate-700 mb-1">
                    Krótki opis sytuacji (opcjonalnie)
                  </label>
                  <input
                    id="issue-notes-input"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="np. Zamalowano w zeszłym tygodniu, postawiono słupki..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2.5 min-w-0 w-full">
                  <label htmlFor="issue-photo-input" className="flex-1 min-w-0 cursor-pointer flex items-center justify-center gap-2 p-2.5 rounded-xl border border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 text-slate-700 text-xs font-semibold active:scale-[0.99] transition overflow-hidden focus-within:ring-2 focus-within:ring-sky-500">
                    <span aria-hidden="true" className="text-base shrink-0">📷</span>
                    <span className="truncate min-w-0 max-w-[190px] sm:max-w-xs block">
                      {photoFile ? photoFile.name : "Wybierz z galerii lub zrób zdjęcie"}
                    </span>
                    <input
                      id="issue-photo-input"
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoChange}
                      className="hidden"
                    />
                  </label>

                  {photoPreview && (
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-slate-300 shadow-sm shrink-0">
                      <img src={photoPreview} alt="Podgląd wybranego zdjęcia" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoFile(null);
                          setPhotoPreview(null);
                        }}
                        aria-label="Usuń wybrane zdjęcie"
                        className="absolute top-0 right-0 bg-rose-600 text-white w-4 h-4 text-[10px] flex items-center justify-center font-bold focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Przyciski akcji */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-600/20 active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[44px] focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
                >
                  {isSubmitting ? (
                    <>
                      <span aria-hidden="true" className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Wysyłanie...</span>
                    </>
                  ) : (
                    <span>Wyślij zgłoszenie</span>
                  )}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
