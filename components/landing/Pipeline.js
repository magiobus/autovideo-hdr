const stages = [
  {
    label: "1. Original photo",
    caption: "A standard edited real-estate shot",
    src: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=70",
  },
  {
    label: "2. Cinematic re-render",
    caption: "Directional light, depth, editorial tone",
    src: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=900&q=70",
  },
  {
    label: "3. Video shot",
    caption: "Slow truck, time-lapse light, parallax",
    src: "https://images.unsplash.com/photo-1600210491892-03d54c0aaf87?auto=format&fit=crop&w=900&q=70",
  },
];

const Pipeline = () => {
  return (
    <section className="relative px-6 py-24 border-t border-white/5">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
          <div className="max-w-2xl">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
              The output looks shot, not generated.
            </h2>
            <p className="mt-3 text-white/60">
              Same pipeline the top creatives use: photo → cinematic photo →
              video — all styled by the creator you picked.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stages.map((s, i) => (
            <div key={s.label} className="group">
              <div className="relative overflow-hidden rounded-2xl border border-white/5">
                <img
                  src={s.src}
                  alt={s.label}
                  className="h-72 w-full object-cover"
                />
                <span className="absolute left-3 top-3 rounded-full bg-black/60 backdrop-blur px-3 py-1 text-xs text-white/90 ring-1 ring-white/10">
                  {s.label}
                </span>
                {i < stages.length - 1 && (
                  <span className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 h-8 w-8 items-center justify-center rounded-full bg-white text-black shadow">
                    →
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm text-white/60">{s.caption}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Pipeline;
