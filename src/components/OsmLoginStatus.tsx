"use client";

import { useEffect, useState } from "react";

type MeResponse = {
  authenticated: boolean;
  user?: {
    id?: number;
    displayName?: string;
    accountCreated?: string;
  };
  scope?: string;
};

export function OsmLoginStatus() {
  const [data, setData] = useState<MeResponse | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadMe() {
      try {
        const response = await fetch("/api/osm/auth/me");
        const json = (await response.json()) as MeResponse;

        if (mounted) {
          setData(json);
        }
      } catch {
        if (mounted) {
          setData({
            authenticated: false
          });
        }
      }
    }

    void loadMe();

    return () => {
      mounted = false;
    };
  }, []);

  if (!data) {
    return <span className="osm-login-loading">OSM…</span>;
  }

  if (!data.authenticated) {
    return (
      <a className="osm-login-button" href="/api/osm/auth/login">
        Zaloguj OSM
      </a>
    );
  }

  return (
    <span className="osm-user-pill">
      <span>OSM: {data.user?.displayName || "zalogowany"}</span>
      <a href="/api/osm/auth/logout">Wyloguj</a>
    </span>
  );
}
