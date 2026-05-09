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
    style: "tiktok",
    propertyInfo: "",
  });

  const canGoNext = () => {
    if (currentStep === 0) return formData.photos.length > 0;
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
      <ul className="steps steps-horizontal w-full">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`step ${i <= currentStep ? "step-primary" : ""}`}
          >
            {label}
          </li>
        ))}
      </ul>

      {/* Step content */}
      <div className="min-h-[300px]">{renderStep()}</div>

      {/* Navigation */}
      {currentStep < STEPS.length - 1 && (
        <div className="flex justify-between">
          <button
            className={`btn btn-ghost ${currentStep === 0 ? "invisible" : ""}`}
            onClick={handleBack}
          >
            Back
          </button>
          <button
            className="btn btn-primary"
            onClick={handleNext}
            disabled={!canGoNext()}
          >
            Next
          </button>
        </div>
      )}

      {currentStep === STEPS.length - 1 && (
        <div className="flex justify-start">
          <button className="btn btn-ghost" onClick={handleBack}>
            Back
          </button>
        </div>
      )}
    </div>
  );
};

export default VideoWizard;
