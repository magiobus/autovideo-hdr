const steps = [
  {
    n: "01",
    title: "Upload your photoshoot",
    body: "Drop your edited property photos. We organize rooms and shot order automatically.",
  },
  {
    n: "02",
    title: "Pick a creator's style",
    body: "Choose from styles built by the top real-estate videographers — movements, song, cuts, all baked in.",
  },
  {
    n: "03",
    title: "Get a cinematic edit back",
    body: "Photos are upgraded into pro-grade video shots and assembled into a fully edited tour. No AI giveaways.",
  },
];

const HowItWorks = () => {
  return (
    <section id="how" className="relative px-6 py-24 border-t border-white/5">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            From a folder of photos to a professional tour
          </h2>
          <p className="mt-3 text-white/60">
            Your photos run through a creative-led pipeline: image cleanup,
            cinematic re-render, and video generation tuned to your chosen
            style.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-white/5 bg-white/[0.02] p-6"
            >
              <span className="text-xs text-white/40">{s.n}</span>
              <h3 className="mt-2 text-lg text-white font-medium">
                {s.title}
              </h3>
              <p className="mt-2 text-sm text-white/60 leading-relaxed">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
