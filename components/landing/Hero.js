import Link from "next/link";

const Hero = ({ authed }) => {
  return (
    <section className="relative px-6 pt-20 pb-16 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[520px] max-w-5xl bg-[radial-gradient(ellipse_at_center,rgba(120,80,255,0.18),transparent_60%)]"
      />

      <div className="relative mx-auto max-w-4xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          New — Photo to Cinematic Video, automated
        </span>

        <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight">
          <span className="bg-gradient-to-b from-white/70 to-white/30 bg-clip-text text-transparent">
            Styles for editing
          </span>
          <br />
          <span className="text-white">an entire property tour</span>
        </h1>

        <p className="mt-6 text-base sm:text-lg text-white/60 max-w-2xl mx-auto">
          Buy Video Models from the best videographers in the country. Upload
          your photoshoot, pick a style, get a fully cinematic edit back — done.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href={authed ? "/projects" : "/api/auth/signin"}
            className="rounded-full bg-white text-black font-medium px-6 py-3 text-sm hover:bg-white/90 transition"
          >
            {authed ? "Open Video Studio" : "Get started — free"}
          </Link>
          <a
            href="#models"
            className="rounded-full bg-white/5 border border-white/10 text-white/80 hover:text-white hover:bg-white/10 transition px-6 py-3 text-sm"
          >
            Browse styles
          </a>
        </div>
      </div>
    </section>
  );
};

export default Hero;
