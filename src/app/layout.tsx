import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CookieConsent } from "@/components/CookieConsent";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gdzie ta koperta?",
  description:
    "Społeczna mapa miejsc parkingowych dla osób z niepełnosprawnościami."
};

export default function RootLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pl">
      <body>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}