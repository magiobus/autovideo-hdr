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
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  if (styles.length === 0) {
    return (
      <div className="py-12 text-center text-white/50">
        <p>No styles available. Run the seed script first.</p>
        <code className="mt-2 block text-xs text-white/35">
          node --experimental-modules scripts/seed-styles.js
        </code>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-white/60">
        Choose a video style
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {styles.map((style) => (
          <div
            key={style._id}
            onClick={() => selectStyle(style._id)}
            className={`cursor-pointer rounded-2xl border bg-white/[0.03] transition hover:border-white/20 hover:bg-white/[0.06] ${
              formData.styleId === style._id
                ? "border-white/40 ring-1 ring-white/20"
                : "border-white/5"
            }`}
          >
            <div className="p-4">
              {/* Aspect ratio badge */}
              <div className="flex items-center justify-between">
                <h3 className="text-base font-medium text-white">{style.name}</h3>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/60">
                  {style.aspectRatio}
                </span>
              </div>

              {style.description && (
                <p className="mt-2 line-clamp-2 text-sm text-white/45">
                  {style.description}
                </p>
              )}

              <div className="mt-3 flex items-center gap-2">
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-black">
                  {style.shotCount} shots
                </span>
                <div className="flex flex-wrap gap-1">
                  {style.roomTypes?.slice(0, 3).map((rt, idx) => (
                    <span
                      key={idx}
                      className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/50"
                    >
                      {rt.replace(/_/g, " ")}
                    </span>
                  ))}
                  {style.roomTypes?.length > 3 && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/50">
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
