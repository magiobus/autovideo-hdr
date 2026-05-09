import { auth } from "@/libs/auth";
import { redirect } from "next/navigation";

export default async function PrivateLayout({ children }) {
  const session = await auth();
  if (!session) {
    redirect("/api/auth/signin");
  }
  return <>{children}</>;
}
