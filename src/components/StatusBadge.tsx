import { SpotStatus, statusLabels } from "@/lib/demoSpots";

export function StatusBadge({ status }: { status: SpotStatus }) {
  return <span className={`status-badge status-${status}`}>{statusLabels[status]}</span>;
}
