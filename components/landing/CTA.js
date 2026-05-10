import Link from "next/link";

const CTA = ({ authed }) => {
  return (
    <section id="pricing" className="relative px-6 py-24 border-t border-white/5">
      <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.02] p-10 md:p-14 text-center">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          A creative team in your pocket.
        </h2>
        <p className="mt-3 text-white/60 max-w-xl mx-auto">
          Stop training novice videographers. Buy the styles, plug in your
          photos, ship cinematic tours your agents will brag about.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href={authed ? "/projects" : "/api/auth/signin"}
            className="rounded-full bg-white text-black font-medium px-6 py-3 text-sm hover:bg-white/90 transition"
          >
            {authed ? "Open Video Studio" : "Start free"}
          </Link>
          <a
            href="#models"
            className="rounded-full bg-white/5 border border-white/10 text-white/80 hover:text-white hover:bg-white/10 transition px-6 py-3 text-sm"
          >
            See styles
          </a>
        </div>
      </div>
    </section>
  );
};

export default CTA;
