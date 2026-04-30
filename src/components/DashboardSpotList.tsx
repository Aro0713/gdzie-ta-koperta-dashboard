import {
  formatMeters,
  formatObjectType,
  getOsmTitle,
  type OsmParkingFeature
} from "@/lib/osmParking";

export function DashboardSpotList({
  features
}: {
  features: OsmParkingFeature[];
}) {
  if (!features.length) {
    return (
      <div className="empty-state-card">
        <strong>Brak pobranych punktów</strong>
        <span>
          Po zgodzie na lokalizację aplikacja pobierze realne dane z
          OpenStreetMap w promieniu 5 km.
        </span>
      </div>
    );
  }

  return (
    <div className="dashboard-real-list">
      {features.map((feature) => {
        const properties = feature.properties || {};
        const key = `${properties.osmType}-${properties.osmId}`;

        return (
          <article className="dashboard-real-card" key={key}>
            <div className="dashboard-real-card-top">
              <div>
                <h3>{getOsmTitle(properties)}</h3>
                <p>{formatObjectType(properties.objectType)}</p>
              </div>

              <span>{formatMeters(properties.distanceMeters)}</span>
            </div>

            <div className="dashboard-real-meta">
              <span>
                {properties.objectType === "disabled_parking_space"
                  ? "dokładna koperta"
                  : "parking z informacją o OzN"}
              </span>
              <span>OzN: {properties.capacityDisabled || "brak danych"}</span>
              <span>nawierzchnia: {properties.surface || "brak danych"}</span>
              <span>dostęp: {properties.access || "brak danych"}</span>
            </div>

            <div className="dashboard-real-actions">
              {properties.osmUrl ? (
                <a
                  href={properties.osmUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link"
                >
                  OSM
                </a>
              ) : null}

              <button type="button" className="mini-button">
                Potwierdź
              </button>

              <button type="button" className="mini-button">
                Problem
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
