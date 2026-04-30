export type StatsCardItem = {
  label: string;
  value: string | number;
  detail: string;
};

const defaultStats: StatsCardItem[] = [
  {
    label: "koperty w bazie",
    value: "—",
    detail: "czekam na lokalizację"
  },
  {
    label: "nowe koperty GTK",
    value: "—",
    detail: "punkty dodane przez użytkowników"
  },
  {
    label: "potwierdzone",
    value: "—",
    detail: "próg: 5 potwierdzeń"
  },
  {
    label: "do sprawdzenia",
    value: "—",
    detail: "czekają na społeczność"
  },
  {
    label: "wnioski",
    value: "—",
    detail: "z modułu wniosków"
  }
];

export function StatsCards({ items = defaultStats }: { items?: StatsCardItem[] }) {
  return (
    <section className="stats-grid" aria-label="Statystyki projektu">
      {items.map((item) => (
        <article className="stat-card" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <small>{item.detail}</small>
        </article>
      ))}
    </section>
  );
}
