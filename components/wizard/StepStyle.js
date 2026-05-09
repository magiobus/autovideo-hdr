"use client";

import { useEffect, useState } from "react";
import apiClient from "@/libs/api";

const StepStyle = ({ formData, setFormData }) => {
  const [styles, setStyles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get("/styles")
      .then((data) => setStyles(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectStyle = (styleId) => {
    setFormData((prev) => ({ ...prev, styleId }));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (styles.length === 0) {
    return (
      <div className="text-center py-12 text-base-content/50">
        <p>No styles available. Run the seed script first.</p>
        <code className="text-xs mt-2 block">
          node --experimental-modules scripts/seed-styles.js
        </code>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-base-content/70 text-center">
        Choose a video style
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {styles.map((style) => (
          <div
            key={style._id}
            onClick={() => selectStyle(style._id)}
            className={`card bg-base-200 cursor-pointer transition-all hover:scale-[1.02] ${
              formData.styleId === style._id
                ? "border-2 border-primary ring-2 ring-primary/20"
                : "border-2 border-transparent"
            }`}
          >
            <div className="card-body py-6">
              {/* Aspect ratio badge */}
              <div className="flex items-center justify-between">
                <h3 className="card-title text-base">{style.name}</h3>
                <span className="badge badge-outline badge-sm">
                  {style.aspectRatio}
                </span>
              </div>

              {style.description && (
                <p className="text-sm text-base-content/50 line-clamp-2">
                  {style.description}
                </p>
              )}

              <div className="flex items-center gap-2 mt-2">
                <span className="badge badge-primary badge-sm">
                  {style.shotCount} shots
                </span>
                <div className="flex flex-wrap gap-1">
                  {style.roomTypes?.slice(0, 3).map((rt) => (
                    <span
                      key={rt}
                      className="badge badge-ghost badge-xs"
                    >
                      {rt.replace(/_/g, " ")}
                    </span>
                  ))}
                  {style.roomTypes?.length > 3 && (
                    <span className="badge badge-ghost badge-xs">
                      +{style.roomTypes.length - 3}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StepStyle;
