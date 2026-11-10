"use client";

import { useState, useRef, useCallback } from "react";

interface UseSwipeDownDismissOptions {
  onDismiss: () => void;
  threshold?: number;
}

export function useSwipeDownDismiss({
  onDismiss,
  threshold = 70,
}: UseSwipeDownDismissOptions) {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number | null>(null);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    startYRef.current = e.touches[0].clientY;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (startYRef.current === null) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;

    if (diff > 0) {
      // Płynny opór przy mocnym pociągnięciu
      setDragY(diff);
    } else {
      setDragY(0);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (startYRef.current === null) return;

    if (dragY > threshold) {
      onDismiss();
    } else {
      setDragY(0);
    }

    startYRef.current = null;
    setIsDragging(false);
  }, [dragY, onDismiss, threshold]);

  // Mouse handlers (dla testów w DevTools na desktopie)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    startYRef.current = e.clientY;
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (startYRef.current === null || !isDragging) return;
    const diff = e.clientY - startYRef.current;
    if (diff > 0) {
      setDragY(diff);
    } else {
      setDragY(0);
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (startYRef.current === null) return;
    if (dragY > threshold) {
      onDismiss();
    } else {
      setDragY(0);
    }
    startYRef.current = null;
    setIsDragging(false);
  }, [dragY, onDismiss, threshold]);

  const bindDragArea = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
  };

  const sheetStyle: React.CSSProperties | undefined =
    dragY > 0
      ? {
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? "none" : "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
          willChange: "transform",
        }
      : undefined;

  return {
    dragY,
    isDragging,
    bindDragArea,
    sheetStyle,
  };
}
