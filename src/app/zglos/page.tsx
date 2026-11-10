import { redirect } from "next/navigation";

export default function ZglosPage() {
  redirect("/app?report=1");
}
