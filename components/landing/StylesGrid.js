import StyleCard from "./StyleCard";

const styles = [
  {
    name: "Golden Hour Dusk",
    style: "The Lisa",
    rating: 4.5,
    reviews: 20,
    creator: "AutoHDR",
    thumbnail:
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=900&q=70",
  },
  {
    name: "Luxe Interior Living",
    style: "The Lisa",
    rating: 4.5,
    reviews: 20,
    creator: "AutoHDR",
    thumbnail:
      "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=900&q=70",
  },
  {
    name: "Modern Coastal Twilight",
    style: "The Lisa",
    rating: 4.8,
    reviews: 20,
    creator: "AutoHDR",
    thumbnail:
      "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=900&q=70",
  },
  {
    name: "Mountain Retreat",
    style: "The Lisa",
    rating: 4.8,
    reviews: 20,
    creator: "AutoHDR",
    thumbnail:
      "https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&w=900&q=70",
  },
  {
    name: "Cozy Bohemian Nook",
    style: "The Lisa",
    rating: 4.8,
    reviews: 20,
    creator: "AutoHDR",
    thumbnail:
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=900&q=70",
  },
  {
    name: "Sleek Urban Loft",
    style: "The Lisa",
    rating: 4.8,
    reviews: 20,
    creator: "AutoHDR",
    thumbnail:
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=70",
  },
];

const StylesGrid = () => {
  return (
    <section id="models" className="relative px-6 pb-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {styles.map((s) => (
            <StyleCard key={s.name} {...s} />
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <button className="rounded-full bg-white/5 border border-white/10 text-white/80 hover:text-white hover:bg-white/10 transition px-6 py-2.5 text-sm">
            View all my models
          </button>
        </div>
      </div>
    </section>
  );
};

export default StylesGrid;
