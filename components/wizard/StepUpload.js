"use client";

import { useRef, useState } from "react";

const StepUpload = ({ formData, setFormData }) => {
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const addPhotos = (files) => {
    const newPhotos = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({
        file,
        preview: URL.createObjectURL(file),
        id: `${file.name}-${Date.now()}-${Math.random()}`,
      }));

    setFormData((prev) => ({
      ...prev,
      photos: [...prev.photos, ...newPhotos],
    }));
  };

  const removePhoto = (id) => {
    setFormData((prev) => {
      const photo = prev.photos.find((p) => p.id === id);
      if (photo) URL.revokeObjectURL(photo.preview);
      return {
        ...prev,
        photos: prev.photos.filter((p) => p.id !== id),
      };
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    addPhotos(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileInput = (e) => {
    addPhotos(e.target.files);
    e.target.value = "";
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className={`cursor-pointer rounded-2xl border border-dashed p-8 text-center transition ${
          isDragging
            ? "border-white/40 bg-white/10"
            : "border-white/15 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.05]"
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="mx-auto mb-3 h-12 w-12 text-white/40"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
          />
        </svg>
        <p className="text-lg font-medium text-white">Drop images here</p>
        <p className="mt-1 text-sm text-white/45">or click to browse</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* Photo count */}
      {formData.photos.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-white/80">
            {formData.photos.length} photo
            {formData.photos.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Thumbnail grid */}
      {formData.photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {formData.photos.map((photo) => (
            <div key={photo.id} className="relative group aspect-square">
              <img
                src={photo.preview}
                alt=""
                className="h-full w-full rounded-xl border border-white/5 object-cover"
              />
              <button
                onClick={() => removePhoto(photo.id)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white opacity-0 ring-1 ring-white/10 transition-opacity group-hover:opacity-100"
              >
                X
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StepUpload;
