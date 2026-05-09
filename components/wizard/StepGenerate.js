"use client";

import { toast } from "react-hot-toast";

const StepGenerate = ({ formData }) => {
  const handleGenerate = () => {
    toast.success("Video generation started!");
  };

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <p className="text-base-content/70 text-center">
        Review and generate
      </p>

      {/* Summary card */}
      <div className="card bg-base-200">
        <div className="card-body">
          <h3 className="card-title text-sm uppercase tracking-wide text-base-content/50">
            Summary
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-base-content/70">Photos</span>
              <span className="font-medium">{formData.photos.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-base-content/70">Style</span>
              <span className="font-medium capitalize">{formData.style}</span>
            </div>
            {formData.propertyInfo && (
              <div>
                <span className="text-base-content/70">Property info</span>
                <p className="font-medium mt-1">{formData.propertyInfo}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Generate button */}
      <button
        className="btn btn-primary btn-lg w-full"
        onClick={handleGenerate}
      >
        Generate Video
      </button>
    </div>
  );
};

export default StepGenerate;
