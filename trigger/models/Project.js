import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const jobSchema = mongoose.Schema(
  {
    falRequestId: String,
    falModel: String,
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    error: String,
    startedAt: Date,
    completedAt: Date,
  },
  { _id: false }
);

const sourceImageSchema = mongoose.Schema(
  {
    url: { type: String, required: true },
    key: String,
    classification: String,
    confidence: Number,
    features: String,
  },
  { _id: false }
);

const transformPassSchema = mongoose.Schema(
  {
    order: Number,
    inputImageUrl: String,
    outputImageUrl: String,
    outputR2Key: String,
    job: jobSchema,
  },
  { _id: false }
);

const clipSchema = mongoose.Schema(
  {
    order: { type: Number, required: true },
    shotIndex: Number,
    sourceImageUrl: String,
    transformedImageUrl: String,
    transformPasses: [transformPassSchema],
    imageJob: jobSchema,
    videoUrl: String,
    videoJob: jobSchema,
    customVideoPrompt: String,
    customDuration: Number,
  },
  { _id: false }
);

const projectSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    style: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Style",
      required: true,
    },
    name: { type: String, default: "Untitled Project" },
    propertyInfo: {
      description: String,
      address: String,
      price: String,
      narrationNotes: String,
    },
    generationOptions: mongoose.Schema.Types.Mixed,
    sourceImages: [sourceImageSchema],
    clips: [clipSchema],
    status: {
      type: String,
      enum: [
        "draft",
        "classifying",
        "generating",
        "assembling",
        "editing",
        "rendering",
        "completed",
        "failed",
      ],
      default: "draft",
    },
    progress: { type: Number, default: 0 },
    finalVideoUrl: String,
    finalVideoKey: String,
    editorState: mongoose.Schema.Types.Mixed,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

projectSchema.plugin(toJSON);

export default mongoose.models.Project ||
  mongoose.model("Project", projectSchema);
