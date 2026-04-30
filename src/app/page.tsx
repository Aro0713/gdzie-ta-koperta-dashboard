import { DashboardHome } from "@/components/DashboardHome";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";

export default function Home() {
  return (
    <main className="page-shell">
      <Header />
      <Hero />
      <DashboardHome />
    </main>
  );
}
