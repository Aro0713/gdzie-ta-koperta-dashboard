export interface NormalizedGovSpot {
  externalId: string;
  sourceType: string;
  authority: string;
  name?: string | null;
  address?: string | null;
  lat: number;
  lng: number;
  slotsCount: number;
  trustScore: number;
  metadata?: Record<string, unknown>;
}

export interface EtlAdapter {
  name: string;
  authority: string;
  fetchSpots(limit?: number): Promise<NormalizedGovSpot[]>;
}

export interface SpatialConflationResult {
  action: "inserted" | "updated" | "skipped";
  id?: string;
  externalId: string;
  distanceDiffMeters?: number;
  confidenceScore?: number;
}
