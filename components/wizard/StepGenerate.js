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

      // Step 2: Create project (triggers Mastra workflow: classify + match)
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

      // Redirect to project page (polling happens there)
      router.push(`/projects/${result.projectId}`);
    } catch (err) {
      setPhase("failed");
      setError(err?.response?.data?.error || err.message);
    }
  };

  // --- READY STATE ---
  if (phase === "ready") {
    return (
      <div className="space-y-6 max-w-md mx-auto">
        <p className="text-base-content/70 text-center">
          Review and generate
        </p>

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
              {formData.propertyInfo?.address && (
                <div className="flex justify-between">
                  <span className="text-base-content/70">Address</span>
                  <span className="font-medium">
                    {formData.propertyInfo.address}
                  </span>
                </div>
              )}
              {formData.propertyInfo?.price && (
                <div className="flex justify-between">
                  <span className="text-base-content/70">Price</span>
                  <span className="font-medium">
                    {formData.propertyInfo.price}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          className="btn btn-primary btn-lg w-full"
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
        <span className="loading loading-spinner loading-lg text-primary" />
        <p className="text-base-content/70">
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
        <div className="text-error text-4xl font-bold">!</div>
        <p className="text-error font-medium">Generation failed</p>
        {error && <p className="text-sm text-base-content/50">{error}</p>}
        <button className="btn btn-primary" onClick={() => setPhase("ready")}>
          Try Again
        </button>
      </div>
    );
  }

  return null;
};

export default StepGenerate;
