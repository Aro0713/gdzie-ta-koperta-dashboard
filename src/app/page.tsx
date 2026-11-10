import { Header } from "@/components/Header";
import { DashboardHome } from "@/components/DashboardHome";

export default function HomePage() {
  return (
    <main className="page-shell">
      <Header />
      <DashboardHome />
    </main>
  );
}
