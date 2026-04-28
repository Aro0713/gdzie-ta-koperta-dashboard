import { KopertaSpot, statusDescriptions } from "@/lib/demoSpots";
import { StatusBadge } from "@/components/StatusBadge";

export function SpotCard({ spot }: { spot: KopertaSpot }) {
  return (
    <article className="spot-card">
      <div className="spot-card-top">
        <div>
          <h3>{spot.name}</h3>
          <p>{spot.address}</p>
        </div>

        <StatusBadge status={spot.status} />
      </div>

      <p className="spot-description">{statusDescriptions[spot.status]}</p>

      <div className="spot-meta">
        <span>{spot.distanceLabel}</span>
        <span>{spot.slots} miejsce/miejsca</span>
        <span>pewność {(spot.confidence * 100).toFixed(0)}%</span>
      </div>

      <div className="tag-row">
        {spot.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </article>
  );
}
