"use client";

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
      <p className="text-base-content/70 text-center">Property details</p>

      <label className="form-control w-full">
        <div className="label">
          <span className="label-text">Address</span>
        </div>
        <input
          type="text"
          placeholder="123 Oak Street, Austin TX"
          className="input input-bordered w-full"
          value={formData.propertyInfo?.address || ""}
          onChange={handleChange("address")}
        />
      </label>

      <label className="form-control w-full">
        <div className="label">
          <span className="label-text">Price</span>
        </div>
        <input
          type="text"
          placeholder="$1,250,000"
          className="input input-bordered w-full"
          value={formData.propertyInfo?.price || ""}
          onChange={handleChange("price")}
        />
      </label>

      <label className="form-control w-full">
        <div className="label">
          <span className="label-text">Description</span>
        </div>
        <textarea
          placeholder="e.g. 200m², 3 bedrooms, 2 bathrooms, pool, big garden, modern kitchen..."
          className="textarea textarea-bordered w-full h-24"
          value={formData.propertyInfo?.description || ""}
          onChange={handleChange("description")}
        />
      </label>

      <label className="form-control w-full">
        <div className="label">
          <span className="label-text">
            Narration notes{" "}
            <span className="text-base-content/40 font-normal">
              (optional)
            </span>
          </span>
        </div>
        <textarea
          placeholder={`Things you'd like mentioned in the voiceover, e.g.:\n• Great for entertaining — huge BBQ area\n• Walking distance to downtown\n• Recently renovated kitchen with Italian marble\n• Ski-in/ski-out access`}
          className="textarea textarea-bordered w-full h-28"
          value={formData.propertyInfo?.narrationNotes || ""}
          onChange={handleChange("narrationNotes")}
        />
        <div className="label">
          <span className="label-text-alt text-base-content/30">
            The AI will combine your notes with what it sees in the photos
          </span>
        </div>
      </label>
    </div>
  );
};

export default StepInfo;
