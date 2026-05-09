import { auth } from "@/libs/auth";
import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import StylesGrid from "@/components/landing/StylesGrid";
import Pipeline from "@/components/landing/Pipeline";
import HowItWorks from "@/components/landing/HowItWorks";
import CTA from "@/components/landing/CTA";
import Footer from "@/components/landing/Footer";

export default async function Home() {
  const session = await auth();
  const authed = Boolean(session);

  return (
    <main className="min-h-screen bg-black text-white selection:bg-white/20">
      <Navbar />
      <Hero authed={authed} />
      <StylesGrid />
      <Pipeline />
      <HowItWorks />
      <CTA authed={authed} />
      <Footer />
    </main>
  );
}
