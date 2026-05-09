"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { uploadFilesToR2 } from "@/helpers/uploadToR2";

const StepGenerate = ({ formData }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadedUrls, setUploadedUrls] = useState(null);

  const handleGenerate = async () => {
    setUploading(true);

    try {
      const files = formData.photos.map((p) => p.file);
      const results = await uploadFilesToR2(files);
      setUploadedUrls(results);

      toast.success(
        `${results.length} image${results.length !== 1 ? "s" : ""} uploaded!`
      );

      // TODO: call video generation API with results (publicUrls) + formData
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
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

      {/* Uploaded URLs feedback */}
      {uploadedUrls && (
        <div className="card bg-success/10 border border-success/30">
          <div className="card-body py-3">
            <p className="text-sm text-success">
              {uploadedUrls.length} image{uploadedUrls.length !== 1 ? "s" : ""}{" "}
              uploaded to R2
            </p>
          </div>
        </div>
      )}

      {/* Generate button */}
      <button
        className="btn btn-primary btn-lg w-full"
        onClick={handleGenerate}
        disabled={uploading || uploadedUrls}
      >
        {uploading ? (
          <>
            <span className="loading loading-spinner loading-sm" />
            Uploading images...
          </>
        ) : uploadedUrls ? (
          "Uploaded"
        ) : (
          "Generate Video"
        )}
      </button>
    </div>
  );
};

export default StepGenerate;
