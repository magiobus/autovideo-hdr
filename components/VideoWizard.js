"use client";

import { useState } from "react";
import StepUpload from "@/components/wizard/StepUpload";
import StepStyle from "@/components/wizard/StepStyle";
import StepInfo from "@/components/wizard/StepInfo";
import StepGenerate from "@/components/wizard/StepGenerate";

const STEPS = ["Upload", "Style", "Info", "Generate"];

const VideoWizard = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    photos: [],
    styleId: null,
    propertyInfo: {
      description: "",
      address: "",
      price: "",
    },
  });

  const canGoNext = () => {
    if (currentStep === 0) return formData.photos.length > 0;
    if (currentStep === 1) return !!formData.styleId;
    return true;
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <StepUpload formData={formData} setFormData={setFormData} />;
      case 1:
        return <StepStyle formData={formData} setFormData={setFormData} />;
      case 2:
        return <StepInfo formData={formData} setFormData={setFormData} />;
      case 3:
        return <StepGenerate formData={formData} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8">
      {/* Step indicator */}
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`rounded-full border px-3 py-2 text-center text-xs transition ${
              i <= currentStep
                ? "border-white/20 bg-white text-black"
                : "border-white/10 bg-white/5 text-white/45"
            }`}
          >
            {label}
          </li>
        ))}
      </ol>

      {/* Step content */}
      <div className="min-h-[300px]">{renderStep()}</div>

      {/* Navigation */}
      {currentStep < STEPS.length - 1 && (
        <div className="flex justify-between">
          <button
            className={`rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white ${currentStep === 0 ? "invisible" : ""}`}
            onClick={handleBack}
          >
            Back
          </button>
          <button
            className="rounded-full bg-white px-5 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-black/50"
            onClick={handleNext}
            disabled={!canGoNext()}
          >
            Next
          </button>
        </div>
      )}

      {currentStep === STEPS.length - 1 && (
        <div className="flex justify-start">
          <button
            className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
            onClick={handleBack}
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
};

export default VideoWizard;
