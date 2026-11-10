"use client";

import React, { useState, useEffect } from "react";
import { reverseGeocode } from "@/lib/photonGeocoding";
import { compressImage } from "@/lib/imageCompression";
import { useSwipeDownDismiss } from "@/hooks/useSwipeDownDismiss";

interface AddSpotModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCoords?: { lat: number; lng: number } | null;
  currentUserLocation?: { lat: number; lng: number } | null;
  onSuccess?: () => void;
}

export function AddSpotModal({
  isOpen,
  onClose,
  initialCoords,
  currentUserLocation,
  onSuccess,
}: AddSpotModalProps) {
  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [address, setAddress] = useState("");
  const [slotsCount, setSlotsCount] = useState("1");
  const [notes, setNotes] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
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

  useEffect(() => {
    if (isOpen) {
      const target = initialCoords || currentUserLocation;
      if (target) {
        setLat(String(target.lat.toFixed(6)));
        setLng(String(target.lng.toFixed(6)));

        reverseGeocode(target.lat, target.lng).then((res) => {
          if (res && res.name && res.name !== "Wybrany punkt na mapie") {
            setAddress(res.description ? `${res.name}, ${res.description}` : res.name);
          }
        });
      } else {
        setLat("");
        setLng("");
        setAddress("");
      }
    }
  }, [isOpen, initialCoords, currentUserLocation]);

  if (!isOpen) return null;

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const compressed = await compressImage(file);
      setPhotoFile(compressed);
      setPhotoPreview(URL.createObjectURL(compressed));
    }
  };

  const handleUseCurrentGps = async () => {
    if (currentUserLocation) {
      setLat(String(currentUserLocation.lat.toFixed(6)));
      setLng(String(currentUserLocation.lng.toFixed(6)));
      reverseGeocode(currentUserLocation.lat, currentUserLocation.lng).then((res) => {
        if (res?.name && res.name !== "Wybrany punkt na mapie") {
          setAddress(res.description ? `${res.name}, ${res.description}` : res.name);
        }
      });
      return;
    }

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const freshLat = pos.coords.latitude;
          const freshLng = pos.coords.longitude;
          setLat(String(freshLat.toFixed(6)));
          setLng(String(freshLng.toFixed(6)));
          reverseGeocode(freshLat, freshLng).then((res) => {
            if (res?.name && res.name !== "Wybrany punkt na mapie") {
              setAddress(res.description ? `${res.name}, ${res.description}` : res.name);
            }
          });
        },
        async () => {
          try {
            const res = await fetch("/api/geolocation");
            if (res.ok) {
              const data = await res.json();
              if (data?.lat && data?.lng) {
                setLat(String(data.lat.toFixed(6)));
                setLng(String(data.lng.toFixed(6)));
                reverseGeocode(data.lat, data.lng).then((res) => {
                  if (res?.name && res.name !== "Wybrany punkt na mapie") {
                    setAddress(res.description ? `${res.name}, ${res.description}` : res.name);
                  }
                });
                return;
              }
            }
          } catch {}
          setErrorMessage("Nie udało się pobrać pozycji GPS. Wskaż punkt na mapie lub wpisz ręcznie w Zaawansowanych.");
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lat || !lng) {
      setErrorMessage("Wskaż lokalizację na mapie lub kliknij 'Mój GPS'.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("lat", lat);
      formData.append("lng", lng);
      formData.append("address", address);
      formData.append("slotsCount", slotsCount);
      formData.append("notes", notes);
      if (photoFile) {
        formData.append("photo", photoFile);
      }

      const res = await fetch("/api/spots/report", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Błąd podczas zapisywania zgłoszenia.");
      }

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || "Wystąpił błąd. Spróbuj ponownie.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[1100] flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm gtk-sheet-backdrop p-0 sm:p-4 overflow-y-auto ${
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
        aria-labelledby="add-spot-title"
        className={`gtk-sheet-content w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] ${
          isClosing ? "gtk-sheet-closing" : ""
        }`}
        style={sheetStyle}
      >
        {/* Uchwyt do pociągnięcia w dół (Swipe-down) */}
        <div
          {...bindDragArea}
          className="w-full pt-3 pb-2 touch-none select-none cursor-grab active:cursor-grabbing flex justify-center"
        >
          <div className="w-12 h-1.5 bg-slate-300 rounded-full hover:bg-slate-400 transition" />
        </div>

        {/* Pasek tytułowy */}
        <div className="px-5 pt-1 pb-3.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1" {...bindDragArea}>
            <span aria-hidden="true" className="text-lg">♿</span>
            <h2 id="add-spot-title" className="text-base font-bold text-slate-900">
              Zgłoś nową kopertę
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Zamknij"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center font-bold text-xs transition shrink-0 ml-2 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
          >
            ✕
          </button>
        </div>

        {/* Ekran sukcesu */}
        {isSuccess ? (
          <div role="status" aria-live="polite" className="p-8 text-center space-y-2">
            <div aria-hidden="true" className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
              ✔
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Dziękujemy za zgłoszenie!
            </h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Nowe miejsce trafiło do weryfikacji. Pomożesz innym kierowcom z niepełnosprawnością.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto overflow-x-hidden w-full max-w-full">
            {errorMessage && (
              <div role="alert" className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200 font-semibold">
                {errorMessage}
              </div>
            )}

            {/* 1. Karta lokalizacji (zamiast technicznych pól GPS) */}
            <div className="p-3 bg-sky-50/70 border border-sky-100 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span aria-hidden="true" className="text-xl shrink-0">📍</span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    {address || (lat && lng ? "Punkt wybrany na mapie" : "Wskaż punkt na mapie")}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {lat && lng ? `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}` : "Brak współrzędnych"}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleUseCurrentGps}
                aria-label="Pobierz bieżącą pozycję GPS z urządzenia"
                className="px-2.5 py-1.5 rounded-xl bg-white border border-sky-200 text-sky-700 hover:bg-sky-50 text-xs font-bold shrink-0 transition active:scale-95 shadow-xs flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
                title="Pobierz pozycję z GPS w telefonie"
              >
                <span aria-hidden="true">🎯</span>
                <span>Mój GPS</span>
              </button>
            </div>

            {/* 2. Liczba miejsc (Szybkie przyciski 1-kliknięciowe zamiast selecta) */}
            <div>
              <label id="slots-count-label" className="text-xs font-bold text-slate-700 block mb-1.5">
                Liczba stanowisk
              </label>
              <div role="group" aria-labelledby="slots-count-label" className="grid grid-cols-4 gap-2">
                {[
                  { val: "1", label: "1 miejsce" },
                  { val: "2", label: "2 miejsca" },
                  { val: "3", label: "3 miejsca" },
                  { val: "4+", label: "4+ miejsc" },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => setSlotsCount(item.val)}
                    aria-pressed={slotsCount === item.val}
                    aria-label={`Liczba stanowisk: ${item.label}`}
                    className={`py-2 px-1 rounded-xl text-xs font-bold transition flex items-center justify-center border active:scale-95 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none ${
                      slotsCount === item.val
                        ? "bg-sky-600 text-white border-sky-600 shadow-sm shadow-sky-600/30"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Zdjęcie oznakowania */}
            <div className="min-w-0">
              <label htmlFor="photo-file-input" className="text-xs font-bold text-slate-700 block mb-1.5">
                Zdjęcie oznakowania (zalecane)
              </label>
              <div className="flex items-center gap-2.5 min-w-0 w-full">
                <label className="flex-1 min-w-0 cursor-pointer flex items-center justify-center gap-2 p-3 rounded-2xl border-2 border-dashed border-slate-200 hover:border-sky-400 bg-slate-50/80 hover:bg-sky-50/50 transition text-xs font-semibold text-slate-700 active:scale-[0.99] overflow-hidden focus-within:ring-2 focus-within:ring-sky-500">
                  <span className="text-base shrink-0" aria-hidden="true">📷</span>
                  <span className="truncate min-w-0 max-w-[190px] sm:max-w-xs block">
                    {photoFile ? photoFile.name : "Wybierz z galerii lub zrób zdjęcie"}
                  </span>
                  <input
                    id="photo-file-input"
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="hidden"
                  />
                </label>
                {photoPreview && (
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-200 shadow-sm shrink-0">
                    <img src={photoPreview} alt="Podgląd wybranego zdjęcia" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoFile(null);
                        setPhotoPreview(null);
                      }}
                      aria-label="Usuń wybrane zdjęcie"
                      className="absolute top-0 right-0 bg-rose-600 text-white w-4 h-4 text-[10px] flex items-center justify-center font-bold focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 4. Notatki / wskazówki */}
            <div>
              <label htmlFor="spot-notes-input" className="text-xs font-bold text-slate-700 block mb-1">
                Wskazówki (opcjonalnie)
              </label>
              <input
                id="spot-notes-input"
                type="text"
                placeholder="np. Przy klatce B, obniżony krawężnik"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
              />
            </div>

            {/* 5. Zaawansowane (zwinięte domyślnie) */}
            <div className="pt-1 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                aria-expanded={showAdvanced}
                aria-controls="advanced-coords-panel"
                className="w-full text-center text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1 py-1 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none rounded-lg"
              >
                <span>{showAdvanced ? "Ukryj zaawansowane" : "Pokaż zaawansowane (edycja GPS / adresu)"}</span>
                <span className="text-[9px]" aria-hidden="true">{showAdvanced ? "▲" : "▼"}</span>
              </button>

              {showAdvanced && (
                <div id="advanced-coords-panel" className="mt-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 animate-in fade-in duration-150">
                  <div>
                    <label htmlFor="manual-address-input" className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Adres / Ulica
                    </label>
                    <input
                      id="manual-address-input"
                      type="text"
                      placeholder="np. ul. Marszałkowska 10"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="manual-lat-input" className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Szerokość (Lat)
                      </label>
                      <input
                        id="manual-lat-input"
                        type="text"
                        value={lat}
                        onChange={(e) => setLat(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="manual-lng-input" className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Długość (Lng)
                      </label>
                      <input
                        id="manual-lng-input"
                        type="text"
                        value={lng}
                        onChange={(e) => setLng(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Przycisk wysyłki */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-98 text-white font-bold text-xs shadow-md shadow-sky-600/25 transition disabled:opacity-50 flex items-center justify-center gap-2 min-h-[46px]"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Zapisywanie zgłoszenia...</span>
                  </>
                ) : (
                  <span>Zapisz zgłoszenie</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
