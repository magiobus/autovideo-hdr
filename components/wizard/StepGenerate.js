"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import apiClient from "@/libs/api";
import { uploadFilesToR2 } from "@/helpers/uploadToR2";

const StepGenerate = ({ formData }) => {
  const router = useRouter();
  const [phase, setPhase] = useState("ready");
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    try {
      // Step 1: Upload photos to R2
      setPhase("uploading");
      const files = formData.photos.map((p) => p.file);
      const uploadResults = await uploadFilesToR2(files);

      // Step 2: Create project (triggers Trigger.dev workflow)
      setPhase("creating");
      const result = await apiClient.post("/projects", {
        styleId: formData.styleId,
        sourceImages: uploadResults.map((r) => ({
          url: r.publicUrl,
          key: r.key,
        })),
        propertyInfo: formData.propertyInfo,
      });

      toast.success("Project created! Redirecting…");

      // Redirect to unified projects page
      router.push(`/projects`);
    } catch (err) {
      setPhase("failed");
      setError(err?.response?.data?.error || err.message);
    }
  };

  // --- READY STATE ---
  if (phase === "ready") {
    return (
      <div className="space-y-6 max-w-md mx-auto">
        <p className="text-center text-white/60">
          Review and generate
        </p>

        <div className="rounded-2xl border border-white/5 bg-white/[0.03]">
          <div className="p-5">
            <h3 className="text-sm font-medium uppercase tracking-wide text-white/40">
              Summary
            </h3>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/55">Photos</span>
                <span className="font-medium">{formData.photos.length}</span>
              </div>
              {formData.propertyInfo?.address && (
                <div className="flex justify-between">
                  <span className="text-white/55">Address</span>
                  <span className="max-w-[13rem] truncate text-right font-medium text-white">
                    {formData.propertyInfo.address}
                  </span>
                </div>
              )}
              {formData.propertyInfo?.price && (
                <div className="flex justify-between">
                  <span className="text-white/55">Price</span>
                  <span className="font-medium text-white">
                    {formData.propertyInfo.price}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          className="w-full rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-white/90"
          onClick={handleGenerate}
        >
          Generate Video
        </button>
      </div>
    );
  }

  // --- UPLOADING / CREATING STATE ---
  if (phase === "uploading" || phase === "creating") {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        <p className="text-white/60">
          {phase === "uploading"
            ? "Uploading photos to cloud..."
            : "Classifying photos & matching to style..."}
        </p>
      </div>
    );
  }

  // --- FAILED STATE ---
  if (phase === "failed") {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="text-4xl font-bold text-rose-300">!</div>
        <p className="font-medium text-rose-200">Generation failed</p>
        {error && <p className="text-sm text-white/50">{error}</p>}
        <button
          className="rounded-full bg-white px-5 py-2 text-sm font-medium text-black transition hover:bg-white/90"
          onClick={() => setPhase("ready")}
        >
          Try Again
        </button>
      </div>
    );
  }

  return null;
};

export default StepGenerate;
