const Star = ({ filled = true }) => (
  <svg
    viewBox="0 0 20 20"
    aria-hidden
    className={`h-3.5 w-3.5 ${filled ? "fill-amber-400" : "fill-white/20"}`}
  >
    <path d="M9.049 2.927a1 1 0 011.902 0l1.286 3.957a1 1 0 00.95.69h4.16a1 1 0 01.588 1.81l-3.366 2.446a1 1 0 00-.364 1.118l1.286 3.957a1 1 0 01-1.539 1.118L10.589 15.6a1 1 0 00-1.176 0L6.05 18.022a1 1 0 01-1.539-1.118l1.286-3.957a1 1 0 00-.364-1.118L2.067 9.384a1 1 0 01.588-1.81h4.16a1 1 0 00.95-.69L9.049 2.927z" />
  </svg>
);

const PlayBadge = () => (
  <span className="absolute inset-0 flex items-center justify-center">
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-md ring-1 ring-white/30 transition group-hover:scale-110">
      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-white ml-0.5">
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  </span>
);

const StyleCard = ({ name, style, rating, reviews, creator, thumbnail }) => {
  const fullStars = Math.round(rating);
  return (
    <div className="group relative rounded-2xl overflow-hidden bg-white/[0.03] border border-white/5 hover:border-white/15 transition-colors">
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={thumbnail}
          alt={name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute right-3 top-3 rounded-full bg-black/55 backdrop-blur px-3 py-1 text-xs text-white/90 ring-1 ring-white/10">
          {style}
        </span>
        <PlayBadge />
      </div>
      <div className="p-4">
        <h3 className="text-white font-medium">{name}</h3>
        <div className="mt-1 flex items-center gap-2 text-xs text-white/60">
          <span className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} filled={i < fullStars} />
            ))}
          </span>
          <span className="text-white/80">{rating.toFixed(1)}</span>
          <span className="text-sky-400">+{reviews} reviews</span>
        </div>
        <p className="mt-2 text-xs text-white/50">
          Creator: <span className="text-white/80 font-medium">{creator}</span>
        </p>
      </div>
    </div>
  );
};

export default StyleCard;
