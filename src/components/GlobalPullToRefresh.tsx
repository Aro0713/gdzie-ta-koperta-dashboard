"use client";

import React, { useEffect, useRef, useState } from "react";

export function GlobalPullToRefresh() {
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const startYRef = useRef<number | null>(null);
  const startXRef = useRef<number | null>(null);
  const isEligibleRef = useRef(false);
  const hasVibratedRef = useRef(false);

  useEffect(() => {
    // Sprawdzamy czy to urządzenie dotykowe
    if (typeof window === "undefined") return;

    // Funkcja sprawdzająca czy element nadrzędny jest przewinięty
    const getScrollTopParent = (element: HTMLElement | null): number => {
      let current = element;
      while (current && current !== document.body && current !== document.documentElement) {
        if (current.scrollTop > 0) {
          return current.scrollTop;
        }
        current = current.parentElement;
      }
      return window.scrollY || document.documentElement.scrollTop || 0;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshing || e.touches.length !== 1) return;

      const touch = e.touches[0];
      const target = touch.target as HTMLElement | null;

      // Ignoruj interaktywne pola tekstowe
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        isEligibleRef.current = false;
        return;
      }

      // Kategorycznie ignoruj gdy otwarte jest jakiekolwiek menu boczne, drawer lub modal
      if (
        target?.closest(".admin-drawer") ||
        target?.closest(".gtk-sheet-content") ||
        target?.closest(".gtk-sheet-backdrop") ||
        target?.closest('[role="dialog"]') ||
        document.querySelector(".admin-drawer") !== null ||
        document.querySelector(".gtk-sheet-backdrop") !== null
      ) {
        isEligibleRef.current = false;
        return;
      }

      // Jeśli element lub którykolwiek rodzic jest przescrollowany w dół, nie przechwytujemy
      const scrollTop = getScrollTopParent(target);
      if (scrollTop > 5) {
        isEligibleRef.current = false;
        return;
      }

      // Jeśli dotyk nastąpił w mapie Leaflet, pozwól na pull-to-refresh tylko przy górnej krawędzi (pasek nagłówka / notch)
      const isMap = target?.closest(".leaflet-container") !== null;
      if (isMap && touch.clientY > 75) {
        isEligibleRef.current = false;
        return;
      }

      startYRef.current = touch.clientY;
      startXRef.current = touch.clientX;
      isEligibleRef.current = true;
      hasVibratedRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isEligibleRef.current || startYRef.current === null || startXRef.current === null || isRefreshing) {
        return;
      }

      const touch = e.touches[0];
      const diffY = touch.clientY - startYRef.current;
      const diffX = touch.clientX - startXRef.current;

      // Jeśli ruch jest bardziej poziomy niż pionowy, anuluj
      if (Math.abs(diffX) > Math.abs(diffY) && diffY < 20) {
        isEligibleRef.current = false;
        setPullY(0);
        return;
      }

      // Tylko przeciągnięcie w dół
      if (diffY > 0) {
        // Opór elastyczny
        const calculated = Math.min(Math.pow(diffY, 0.82) * 1.6, 90);
        setPullY(calculated);

        if (calculated >= 65) {
          setIsReady(true);
          if (!hasVibratedRef.current) {
            hasVibratedRef.current = true;
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate(20);
            }
          }
        } else {
          setIsReady(false);
          hasVibratedRef.current = false;
        }

        // Zapobiegaj domyślnemu skrolowaniu gdy ciągniemy w dół
        if (e.cancelable && calculated > 15) {
          e.preventDefault();
        }
      } else {
        setPullY(0);
        setIsReady(false);
      }
    };

    const handleTouchEnd = () => {
      if (!isEligibleRef.current || startYRef.current === null) {
        startYRef.current = null;
        startXRef.current = null;
        return;
      }

      startYRef.current = null;
      startXRef.current = null;
      isEligibleRef.current = false;

      if (pullY >= 65) {
        setIsRefreshing(true);
        setPullY(60);
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([15, 30, 25]);
        }
        // Wywołujemy pełne odświeżenie aplikacji
        setTimeout(() => {
          window.location.reload();
        }, 300);
      } else {
        setPullY(0);
        setIsReady(false);
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [pullY, isRefreshing]);

  if (pullY === 0 && !isRefreshing) return null;

  return (
    <div
      className="fixed left-0 right-0 z-[50000] pointer-events-none flex justify-center transition-transform duration-100 ease-out"
      style={{
        top: "max(12px, env(safe-area-inset-top, 12px))",
        transform: `translateY(${pullY}px)`,
        opacity: Math.min(pullY / 30, 1),
      }}
    >
      <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-[0_10px_25px_rgba(0,0,0,0.5)] text-xs font-semibold text-slate-100">
        {isRefreshing ? (
          <>
            <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-sky-300">Odświeżanie aplikacji...</span>
          </>
        ) : isReady ? (
          <>
            <div className="w-4 h-4 rounded-full bg-sky-500 flex items-center justify-center text-white text-[10px] animate-bounce shrink-0">
              ↓
            </div>
            <span className="text-sky-300 font-bold">Puść, aby odświeżyć</span>
          </>
        ) : (
          <>
            <div
              className="w-4 h-4 text-slate-400 flex items-center justify-center text-sm transition-transform duration-100 shrink-0"
              style={{ transform: `rotate(${Math.min(pullY * 2.8, 180)}deg)` }}
            >
              ↓
            </div>
            <span className="text-slate-300">Przeciągnij w dół, aby odświeżyć</span>
          </>
        )}
      </div>
    </div>
  );
}
