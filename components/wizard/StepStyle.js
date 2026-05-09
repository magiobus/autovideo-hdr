"use client";

const styles = [
  {
    id: "tiktok",
    label: "TikTok",
    subtitle: "Vertical 9:16",
    aspectClass: "w-12 h-20",
  },
  {
    id: "landscape",
    label: "Landscape",
    subtitle: "Horizontal 16:9",
    aspectClass: "w-20 h-12",
  },
];

const StepStyle = ({ formData, setFormData }) => {
  const selectStyle = (styleId) => {
    setFormData((prev) => ({ ...prev, style: styleId }));
  };

  return (
    <div className="space-y-4">
      <p className="text-base-content/70 text-center">
        Choose your video format
      </p>
      <div className="grid grid-cols-2 gap-4">
        {styles.map((style) => (
          <div
            key={style.id}
            onClick={() => selectStyle(style.id)}
            className={`card bg-base-200 cursor-pointer transition-all hover:scale-[1.02] ${
              formData.style === style.id
                ? "border-2 border-primary ring-2 ring-primary/20"
                : "border-2 border-transparent"
            }`}
          >
            <div className="card-body items-center text-center py-8">
              {/* Aspect ratio preview */}
              <div
                className={`${style.aspectClass} bg-primary/30 rounded border border-primary/50 mb-3`}
              />
              <h3 className="card-title text-lg">{style.label}</h3>
              <p className="text-sm text-base-content/50">{style.subtitle}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StepStyle;
