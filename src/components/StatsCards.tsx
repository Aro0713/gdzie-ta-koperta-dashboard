import Link from "next/link";

export type StatsCardItem = {
  label: string;
  value: string | number;
  detail: string;
  href?: string;
};

function StatsCardContent({ item }: { item: StatsCardItem }) {
  return (
    <>
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      <small>{item.detail}</small>
    </>
  );
}

export function StatsCards({ items }: { items: StatsCardItem[] }) {
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
