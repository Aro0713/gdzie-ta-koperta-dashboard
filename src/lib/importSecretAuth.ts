import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

function cleanSecret(value: string | null | undefined) {
  let text = String(value || "").trim();

  if (text.toLowerCase().startsWith("bearer ")) {
    text = text.slice(7).trim();
  }

  if (text.startsWith("AI_CANDIDATES_IMPORT_SECRET=")) {
    text = text.replace(/^AI_CANDIDATES_IMPORT_SECRET=/, "").trim();
  }

  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }

  return text;
}

function safeEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);

  return (
    firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer)
  );
}

export function isAuthorizedImportRequest(request: NextRequest) {
  const expectedSecret = cleanSecret(process.env.AI_CANDIDATES_IMPORT_SECRET);

  if (!expectedSecret) {
    return false;
  }

  const authHeader = cleanSecret(request.headers.get("authorization"));
  const importHeader = cleanSecret(request.headers.get("x-import-secret"));

  return (
    safeEqual(authHeader, expectedSecret) ||
    safeEqual(importHeader, expectedSecret)
  );
}