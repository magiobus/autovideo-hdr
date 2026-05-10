"use client";

const fieldClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-white/25 focus:bg-white/[0.06]";
const labelClass = "mb-2 block text-xs font-medium uppercase tracking-wider text-white/40";

const StepInfo = ({ formData, setFormData }) => {
  const handleChange = (field) => (e) => {
    setFormData((prev) => ({
      ...prev,
      propertyInfo: {
        ...prev.propertyInfo,
        [field]: e.target.value,
      },
    }));
  };

  return (
    <div className="space-y-4 max-w-md mx-auto">
      <p className="text-center text-white/60">Property details</p>

      <label className="block w-full">
        <span className={labelClass}>Address</span>
        <input
          type="text"
          placeholder="123 Oak Street, Austin TX"
          className={fieldClass}
          value={formData.propertyInfo?.address || ""}
          onChange={handleChange("address")}
        />
      </label>

      <label className="block w-full">
        <span className={labelClass}>Price</span>
        <input
          type="text"
          placeholder="$1,250,000"
          className={fieldClass}
          value={formData.propertyInfo?.price || ""}
          onChange={handleChange("price")}
        />
      </label>

      <label className="block w-full">
        <span className={labelClass}>Description</span>
        <textarea
          placeholder="e.g. 200m², 3 bedrooms, 2 bathrooms, pool, big garden, modern kitchen..."
          className={`${fieldClass} h-24 resize-none`}
          value={formData.propertyInfo?.description || ""}
          onChange={handleChange("description")}
        />
      </label>

      <label className="block w-full">
        <span className={labelClass}>
          Narration notes <span className="font-normal text-white/30">(optional)</span>
        </span>
        <textarea
          placeholder={`Things you'd like mentioned in the voiceover, e.g.:\n• Great for entertaining — huge BBQ area\n• Walking distance to downtown\n• Recently renovated kitchen with Italian marble\n• Ski-in/ski-out access`}
          className={`${fieldClass} h-28 resize-none`}
          value={formData.propertyInfo?.narrationNotes || ""}
          onChange={handleChange("narrationNotes")}
        />
        <span className="mt-2 block text-xs text-white/30">
          The AI will combine your notes with what it sees in the photos
        </span>
      </label>
    </div>
  );
};

export default StepInfo;
