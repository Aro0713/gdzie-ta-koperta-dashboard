import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VercelAnalyticsEvent = Record<string, unknown>;

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      details
    },
    {
      status
    }
  );
}

function cleanSecret(value: string | null | undefined) {
  let text = String(value || "").trim();

  if (text.toLowerCase().startsWith("bearer ")) {
    text = text.slice(7).trim();
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

function isAuthorized(request: NextRequest) {
  const expectedSecret = cleanSecret(process.env.VERCEL_ANALYTICS_DRAIN_SECRET);

  if (!expectedSecret) {
    return false;
  }

  const authHeader = cleanSecret(request.headers.get("authorization"));
  const drainHeader = cleanSecret(request.headers.get("x-drain-secret"));
  const querySecret = cleanSecret(request.nextUrl.searchParams.get("secret"));

  return (
    safeEqual(authHeader, expectedSecret) ||
    safeEqual(drainHeader, expectedSecret) ||
    safeEqual(querySecret, expectedSecret)
  );
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;

  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function toText(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();

  return text || null;
}

function toNumber(value: unknown) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function getTimestampMs(event: VercelAnalyticsEvent) {
  const timestamp = toNumber(event.timestamp);

  if (timestamp && timestamp > 0) {
    return Math.trunc(timestamp);
  }

  return Date.now();
}

function getEventHash(event: VercelAnalyticsEvent) {
  return createHash("sha256")
    .update(stableStringify(event))
    .digest("hex");
}

function parsePayload(raw: string): VercelAnalyticsEvent[] {
  const text = raw.trim();

  if (!text) {
    return [];
  }

  try {
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) {
      return parsed.filter((item) => item && typeof item === "object");
    }

    if (parsed && typeof parsed === "object") {
      return [parsed as VercelAnalyticsEvent];
    }

    return [];
  } catch {
    const events: VercelAnalyticsEvent[] = [];

    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      const parsed = JSON.parse(trimmed);

      if (parsed && typeof parsed === "object") {
        events.push(parsed as VercelAnalyticsEvent);
      }
    }

    return events;
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "vercel-analytics-drain"
  });
}

export async function POST(request: NextRequest) {
  if (!process.env.VERCEL_ANALYTICS_DRAIN_SECRET) {
    return jsonError("Missing VERCEL_ANALYTICS_DRAIN_SECRET", 500);
  }

  if (!isAuthorized(request)) {
    return jsonError("Unauthorized", 401);
  }

  let events: VercelAnalyticsEvent[];

  try {
    const raw = await request.text();
    events = parsePayload(raw);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid drain payload";

    return jsonError("Invalid drain payload", 400, message);
  }

  if (events.length === 0) {
    return jsonError("Payload does not contain analytics events", 400);
  }

  let inserted = 0;
  let skipped = 0;

  for (const event of events) {
    const eventHash = getEventHash(event);
    const timestampMs = getTimestampMs(event);
    const rawJson = JSON.stringify(event);

    const rows = await sql`
      INSERT INTO gtk_analytics_events (
        event_hash,
        "schema",
        event_type,
        event_name,
        timestamp_ms,
        occurred_at,
        project_id,
        owner_id,
        data_source_name,
        session_id,
        device_id,
        origin,
        path,
        route,
        referrer,
        query_params,
        country,
        region,
        city,
        os_name,
        os_version,
        client_name,
        client_type,
        client_version,
        device_type,
        vercel_environment,
        vercel_url,
        deployment,
        raw
      )
      VALUES (
        ${eventHash},
        ${toText(event.schema)},
        ${toText(event.eventType) || "unknown"},
        ${toText(event.eventName)},
        ${timestampMs},
        to_timestamp(${timestampMs} / 1000.0),
        ${toText(event.projectId)},
        ${toText(event.ownerId)},
        ${toText(event.dataSourceName)},
        ${toText(event.sessionId)},
        ${toText(event.deviceId)},
        ${toText(event.origin)},
        ${toText(event.path)},
        ${toText(event.route)},
        ${toText(event.referrer)},
        ${toText(event.queryParams)},
        ${toText(event.country)},
        ${toText(event.region)},
        ${toText(event.city)},
        ${toText(event.osName)},
        ${toText(event.osVersion)},
        ${toText(event.clientName)},
        ${toText(event.clientType)},
        ${toText(event.clientVersion)},
        ${toText(event.deviceType)},
        ${toText(event.vercelEnvironment)},
        ${toText(event.vercelUrl)},
        ${toText(event.deployment)},
        ${rawJson}::jsonb
      )
      ON CONFLICT (event_hash) DO NOTHING
      RETURNING id
    `;

    if (rows.length > 0) {
      inserted += 1;
    } else {
      skipped += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    received: events.length,
    inserted,
    skipped
  });
}