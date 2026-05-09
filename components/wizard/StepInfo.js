"use client";

const StepInfo = ({ formData, setFormData }) => {
  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, propertyInfo: e.target.value }));
  };

  return (
    <div className="space-y-4 max-w-md mx-auto">
      <p className="text-base-content/70 text-center">
        Property details
      </p>

      <label className="form-control w-full">
        <div className="label">
          <span className="label-text">Describe the property</span>
        </div>
        <textarea
          placeholder="e.g. 200m², 3 bedrooms, 2 bathrooms, pool, big garden, modern kitchen..."
          className="textarea textarea-bordered w-full h-32"
          value={formData.propertyInfo}
          onChange={handleChange}
        />
      </label>
    </div>
  );
};

export default StepInfo;
