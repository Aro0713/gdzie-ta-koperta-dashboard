import Link from "next/link";

export type StatsCardItem = {
  label: string;
  value: string | number;
  detail: string;
  href?: string;
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

function StatsCardContent({ item }: { item: StatsCardItem }) {
  return (
    <>
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      <small>{item.detail}</small>
    </>
  );
}

export function StatsCards({ items = defaultStats }: { items?: StatsCardItem[] }) {
  return (
    <section className="stats-grid" aria-label="Statystyki projektu">
      {items.map((item) => {
        if (item.href) {
          return (
            <Link
              className="stat-card stat-card-link"
              href={item.href}
              key={item.label}
              aria-label={`${item.label}: ${item.value}. ${item.detail}`}
            >
              <StatsCardContent item={item} />
            </Link>
          );
        }

        return (
          <article className="stat-card" key={item.label}>
            <StatsCardContent item={item} />
          </article>
        );
      })}
    </section>
  );
}