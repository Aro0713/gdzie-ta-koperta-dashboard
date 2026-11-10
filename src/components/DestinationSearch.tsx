"use client";

import React, { useEffect, useState, useRef } from "react";
import { searchDestinations, type GeocodingResult } from "@/lib/photonGeocoding";

interface DestinationSearchProps {
  onSelectDestination: (dest: { lat: number; lng: number; name: string }) => void;
  onUseMyLocation: () => void;
  isLocating?: boolean;
}

export function DestinationSearch({
  onSelectDestination,
  onUseMyLocation,
  isLocating
}: DestinationSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSelectingRef = useRef(false);

  // Zamykanie listy po kliknięciu poza wyszukiwarkę
  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  // Wyszukiwanie geokodowania (Photon)
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Jeśli zmiana query wynika z wybrania elementu z listy, nie szukamy ponownie
    if (isSelectingRef.current) {
      isSelectingRef.current = false;
      setIsLoading(false);
      setIsOpen(false);
      return;
    }

    if (query.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    searchTimeoutRef.current = setTimeout(async () => {
      const items = await searchDestinations(query);
      setResults(items);
      setIsLoading(false);
      if (items.length > 0) {
        setIsOpen(true);
      }
    }, 250);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query]);

  const handleSelect = (item: GeocodingResult) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    isSelectingRef.current = true;
    setQuery(item.name);
    setResults([]);
    setIsLoading(false);
    setIsOpen(false);
    inputRef.current?.blur(); // Schowaj klawiaturę na telefonie

    onSelectDestination({
      lat: item.lat,
      lng: item.lng,
      name: item.name
    });
  };

  return (
    <div ref={containerRef} className="relative w-full z-[500]">
      {/* Pasek wyszukiwania */}
      <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl shadow-md border border-slate-200 focus-within:ring-2 focus-within:ring-sky-500 transition">
        <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>

        <input
          ref={inputRef}
          type="text"
          id="destination-search-input"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen && results.length > 0}
          aria-controls="destination-search-results"
          aria-label="Wpisz cel podróży lub adres"
          value={query}
          onChange={(e) => {
            isSelectingRef.current = false;
            setQuery(e.target.value);
          }}
          onFocus={() => {
            if (results.length > 0 && !isSelectingRef.current) {
              setIsOpen(true);
            }
          }}
          placeholder="Wpisz cel podróży (np. Banacha 1a, Warszawa)..."
          className="flex-1 bg-transparent text-slate-900 placeholder-slate-400 text-sm font-medium focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none rounded px-1 min-w-0"
        />

        {query.length > 0 && (
          <button
            type="button"
            aria-label="Wyczyść wpisany cel podróży"
            onClick={() => {
              isSelectingRef.current = false;
              setQuery("");
              setResults([]);
              setIsOpen(false);
            }}
            className="w-6 h-6 text-slate-400 hover:text-slate-600 flex items-center justify-center text-sm font-bold active:scale-95 transition focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
          >
            ✕
          </button>
        )}

        <button
          type="button"
          aria-label="Użyj mojej bieżącej lokalizacji GPS jako celu podróży"
          onClick={() => {
            isSelectingRef.current = false;
            setQuery("");
            setResults([]);
            setIsOpen(false);
            inputRef.current?.blur();
            onUseMyLocation();
          }}
          disabled={isLocating}
          title="Zlokalizuj moją pozycję"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition border border-slate-200 disabled:opacity-50 shrink-0 active:scale-95 focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <svg className={`w-3.5 h-3.5 ${isLocating ? "animate-spin text-sky-600" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="hidden sm:inline">Moja pozycja</span>
        </button>
      </div>

      {/* Lista wyników podpowiedzi z Photon */}
      {isOpen && results.length > 0 && (
        <div
          id="destination-search-results"
          role="listbox"
          aria-label="Podpowiedzi adresowe"
          className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto z-[600]"
        >
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected="false"
              aria-label={`${item.name}${item.description ? `, ${item.description}` : ""}`}
              onPointerDown={(e) => {
                // Zapobiegamy utracie kliknięcia przez chowanie klawiatury ekranowej
                e.preventDefault();
                handleSelect(item);
              }}
              onClick={() => handleSelect(item)}
              className="w-full px-3.5 py-2.5 text-left hover:bg-sky-50 active:bg-sky-100 transition flex items-start gap-2.5 cursor-pointer focus-visible:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
            >
              <span className="text-slate-400 mt-0.5 text-sm shrink-0" aria-hidden="true">📍</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-900 text-sm truncate">
                  {item.name}
                </div>
                {item.description && (
                  <div className="text-xs text-slate-500 truncate">
                    {item.description}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Wskaźnik ładowania */}
      {isLoading && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white p-2.5 rounded-xl shadow-md border border-slate-200 text-center text-xs text-slate-500 font-medium">
          Wyszukiwanie adresu...
        </div>
      )}
    </div>
  );
}
