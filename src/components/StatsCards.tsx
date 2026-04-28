const stats = [
  { label: "koperty w bazie", value: "3", detail: "dane demo MVP" },
  { label: "potwierdzone", value: "1", detail: "ostatnia weryfikacja: dziś" },
  { label: "do sprawdzenia", value: "2", detail: "społeczność decyduje" },
  { label: "wnioski", value: "0", detail: "moduł w przygotowaniu" }
];

export function StatsCards() {
  return (
    <section className="stats-grid" aria-label="Statystyki projektu">
      {stats.map((item) => (
        <article className="stat-card" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <small>{item.detail}</small>
        </article>
      ))}
    </section>
  );
}
