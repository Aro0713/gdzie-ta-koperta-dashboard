export type LocalOfficialRequest = {
  id: string;
  requestType: string;
  status: "draft" | "generated" | "sent";
  createdAt: string;
};

export const LOCAL_OFFICIAL_REQUESTS_KEY =
  "gdzietakoperta.officialRequests.v1";

function createLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `request_${Date.now()}_${Math.round(Math.random() * 100000)}`;
}

export function readLocalOfficialRequests() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_OFFICIAL_REQUESTS_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => {
      return (
        typeof item?.id === "string" &&
        typeof item?.requestType === "string" &&
        typeof item?.createdAt === "string"
      );
    }) as LocalOfficialRequest[];
  } catch {
    return [];
  }
}

export function saveLocalOfficialRequests(requests: LocalOfficialRequest[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    LOCAL_OFFICIAL_REQUESTS_KEY,
    JSON.stringify(requests)
  );
}

export function addLocalOfficialRequest(requestType: string) {
  const current = readLocalOfficialRequests();

  const next: LocalOfficialRequest[] = [
    {
      id: createLocalId(),
      requestType,
      status: "generated",
      createdAt: new Date().toISOString()
    },
    ...current
  ];

  saveLocalOfficialRequests(next);

  return next;
}
