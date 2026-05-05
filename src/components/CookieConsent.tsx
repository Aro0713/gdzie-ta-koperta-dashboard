"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";

const COOKIE_CONSENT_KEY = "gdzietakoperta.cookieConsent.v1";
const COOKIE_POLICY_VERSION = "2026-05-05";

type CookieConsentValue = {
  accepted: boolean;
  acceptedAt: string;
  policyVersion: string;
};

function hasAcceptedCookiePolicy() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_KEY);

    if (!raw) {
      return false;
    }

    const parsed = JSON.parse(raw) as Partial<CookieConsentValue>;

    return (
      parsed.accepted === true &&
      parsed.policyVersion === COOKIE_POLICY_VERSION
    );
  } catch {
    return false;
  }
}

export function CookieConsent() {
  const [hydrated, setHydrated] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    setAccepted(hasAcceptedCookiePolicy());
    setHydrated(true);
  }, []);

  function acceptCookiePolicy() {
    if (!confirmed) {
      return;
    }

    try {
      const value: CookieConsentValue = {
        accepted: true,
        acceptedAt: new Date().toISOString(),
        policyVersion: COOKIE_POLICY_VERSION
      };

      window.localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(value));
    } catch {
      // Jeżeli localStorage jest niedostępny, chowamy baner tylko w tej sesji.
    }

    setAccepted(true);
  }

  if (!hydrated) {
    return null;
  }

  return (
    <>
      {accepted ? <Analytics /> : null}

      {!accepted ? (
        <section
          className="cookie-consent"
          role="dialog"
          aria-label="Zgoda na cookies"
          aria-live="polite"
        >
          <div className="cookie-consent-copy">
            <strong>Cookies i dane lokalne</strong>
            <p>
              Korzystamy z plików cookies oraz pamięci lokalnej przeglądarki do
              działania serwisu, logowania przez OpenStreetMap i obsługi mapy.
              Analityka zostanie uruchomiona dopiero po zatwierdzeniu.
            </p>

            <label className="cookie-consent-checkbox">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                Potwierdzam, że zapoznałem/am się z polityką cookies i
                akceptuję jej zasady.
              </span>
            </label>
          </div>

          <div className="cookie-consent-actions">
            <Link href="/polityka-cookies" className="ghost-button">
              Przeczytaj politykę
            </Link>

            <button
              type="button"
              className="primary-button cookie-consent-accept"
              onClick={acceptCookiePolicy}
              disabled={!confirmed}
            >
              Akceptuję
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}