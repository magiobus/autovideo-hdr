import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const textOverlaySchema = mongoose.Schema(
  {
    text: String,
    position: { type: String, default: "bottom-center" },
    animation: { type: String, default: "fade-in" },
    startAt: { type: Number, default: 0.5 },
    duration: { type: Number, default: 3 },
  },
  { _id: false }
);

const imageTransformSchema = mongoose.Schema(
  {
    order: { type: Number, required: true },
    prompt: { type: String, required: true },
    model: { type: String, default: "fal-ai/nano-banana/edit" },
  },
  { _id: false }
);

const shotSchema = mongoose.Schema(
  {
    order: { type: Number, required: true },
    name: String,
    roomType: {
      type: String,
      required: true,
      enum: [
        "exterior_front",
        "exterior_back",
        "living_room",
        "kitchen",
        "bedroom",
        "bathroom",
        "dining",
        "pool",
        "detail",
        "aerial",
        "garage",
        "office",
        "hallway",
        "patio",
      ],
    },
    // Legacy single-pass (backward compat)
    imagePrompt: String,
    imageModel: {
      type: String,
      default: "fal-ai/nano-banana/edit",
    },
    // Multi-pass transforms (takes priority over imagePrompt)
    imageTransforms: [imageTransformSchema],
    videoPrompt: { type: String, required: true },
    videoModel: {
      type: String,
      default: "fal-ai/kling-video/v3/pro",
    },
    duration: { type: Number, default: 5 },
    textOverlay: textOverlaySchema,
  },
  { _id: false }
);

const styleSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    description: String,
    thumbnailUrl: String,
    demoVideoUrl: String,
    isPublic: { type: Boolean, default: true },
    aspectRatio: {
      type: String,
      enum: ["16:9", "9:16"],
      default: "16:9",
    },
    musicUrl: String,
    voiceover: {
      enabled: { type: Boolean, default: true },
      voice: { type: String, default: "shimmer" },
      speed: { type: Number, default: 0.95 },
    },
    shots: [shotSchema],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

styleSchema.plugin(toJSON);

export default mongoose.models.Style || mongoose.model("Style", styleSchema);
