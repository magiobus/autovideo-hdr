import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Set MONGODB_URI env var. E.g.: source .env.local && node scripts/seed-styles.mjs");
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
console.log("Connected to database");

// Inline schema (avoids Next.js module resolution issues)
const shotSchema = new mongoose.Schema(
  {
    order: Number,
    name: String,
    roomType: String,
    imagePrompt: String,
    imageModel: { type: String, default: "fal-ai/nano-banana/image-to-image" },
    videoPrompt: String,
    videoModel: { type: String, default: "fal-ai/kling-video/v3/pro" },
    duration: { type: Number, default: 5 },
    textOverlay: {
      text: String,
      position: String,
      animation: String,
      startAt: Number,
      duration: Number,
    },
  },
  { _id: false }
);

const styleSchema = new mongoose.Schema(
  {
    name: String,
    slug: { type: String, unique: true },
    description: String,
    isPublic: { type: Boolean, default: true },
    aspectRatio: { type: String, default: "16:9" },
    musicUrl: String,
    shots: [shotSchema],
  },
  { timestamps: true }
);

const Style = mongoose.models.Style || mongoose.model("Style", styleSchema);

const styles = [
  {
    name: "Golden Hour Cinematic",
    slug: "golden-hour-cinematic",
    description:
      "Warm cinematic tones with dramatic light progression. Slow camera movements with golden hour lighting for emotional property tours.",
    aspectRatio: "16:9",
    shots: [
      {
        order: 0,
        name: "Establishing Shot",
        roomType: "exterior_front",
        imagePrompt:
          "Transform this photo into a cinematic editorial image with harsh, directional shadows and crisp light shaping. Correct any perspective distortion—ensure vertical lines are truly vertical and horizontal lines are level. Preserve the original white balance. Balance overall exposure: raise interior midtones subtly, preserve deep sculpted shadow structure. Apply filmic window pulls revealing deep rich exterior views. Polished and cinematic.",
        videoPrompt:
          "Very slow dolly in, time-lapse light progression, camera moves forward in straight line through space, shadows gradually move and lengthen, parallax effect, consistent exposure, stable motion, cinematic, photorealistic",
        duration: 5,
        textOverlay: { text: "{{address}}", position: "bottom-center", animation: "fade-in", startAt: 0.5, duration: 3 },
      },
      {
        order: 1,
        name: "Grand Living",
        roomType: "living_room",
        imagePrompt:
          "Transform this photo into a cinematic editorial image with controlled, directional shadows. Bright and airy while retaining depth and dimension. Inviting, well-lit, and polished. Preserve all architectural and interior details.",
        videoPrompt:
          "Wide interior shot with slow trucking movement side to side as harsh directional light moves and expands across modern living space. Dramatic shadows crawl and shift. Camera tracks laterally. Editorial film style. Neutral white balance, balanced exposure. Smooth parallel motion. Atmospheric architectural cinematography.",
        duration: 5,
      },
      {
        order: 2,
        name: "Kitchen Detail",
        roomType: "kitchen",
        imagePrompt:
          "85mm close up detail shot of the main feature in the room. Cinematic editorial style. Neutral white balance, balanced exposure. Sharp texture detail in wood grain, fabric, or architectural elements.",
        videoPrompt:
          "Tight interior shot with slow trucking movement side to side. Dramatic shadows. Crisp shadow edges in motion. Editorial film style. Smooth parallel motion.",
        duration: 5,
      },
      {
        order: 3,
        name: "Primary Suite",
        roomType: "bedroom",
        imagePrompt:
          "Transform this photo into a cinematic editorial image with harsh, directional shadows. Correct perspective distortion. Derive all lighting direction from visible sources: windows, doors, fixtures.",
        videoPrompt:
          "Wide interior shot with a slow and smooth dolly in. Dramatic shadows crawl and shift. Editorial film style. Neutral white balance. Smooth parallel motion. Atmospheric architectural cinematography.",
        duration: 5,
      },
      {
        order: 4,
        name: "Bath Detail",
        roomType: "bathroom",
        imagePrompt:
          "85mm close up detail shot of light being cast onto the bathroom cabinets. Cinematic editorial style. Sharp texture detail.",
        videoPrompt:
          "Extreme close-up detail shot with smooth tracking camera following harsh directional light across textured surface. Crisp shadow edges crawl in real time. Shallow depth of field.",
        duration: 5,
      },
      {
        order: 5,
        name: "Outdoor Living",
        roomType: "exterior_back",
        imagePrompt:
          "Transform this photo into a cinematic editorial image with harsh, directional shadows and crisp light shaping. Preserve all architectural details. Well-lit yet moody, polished and cinematic.",
        videoPrompt:
          "Super smooth camera travels in arc around subject, subject stays centered, sky hyperlapses naturally in the background, cinematic",
        duration: 5,
        textOverlay: { text: "{{price}}", position: "bottom-center", animation: "fade-in", startAt: 1, duration: 3 },
      },
    ],
  },
  {
    name: "Editorial Luxury",
    slug: "editorial-luxury",
    description:
      "Bold high-contrast editorial style. Tight detail shots and slow reveals for a premium magazine-quality feel.",
    aspectRatio: "16:9",
    shots: [
      {
        order: 0,
        name: "Arrival",
        roomType: "exterior_front",
        imagePrompt:
          "Generate a 50mm detail shot looking upward at the roofline with sharp architectural edges against the sky. Sharp focus on roof edges. Preserve exact architecture and materials.",
        videoPrompt:
          "Super smooth camera rises vertically upward, straight vertical path, cinematic, revealing architecture against sky",
        duration: 5,
        textOverlay: { text: "{{address}}", position: "center", animation: "fade-in", startAt: 0, duration: 4 },
      },
      {
        order: 1,
        name: "Living Space",
        roomType: "living_room",
        imagePrompt:
          "Transform this photo into a cinematic editorial image with harsh, directional shadows. Correct perspective distortion. Preserve all architectural and interior details. Well-lit yet moody.",
        videoPrompt:
          "Super smooth camera moves forward while rotating gradually right, curved path, cinematic, revealing full living space with dramatic lighting",
        duration: 5,
      },
      {
        order: 2,
        name: "Texture Detail",
        roomType: "detail",
        imagePrompt:
          "Cinematic close up detail shot - maintain white balance - soft bokeh - preserve all architectural and interior details.",
        videoPrompt:
          "Extreme close-up detail shot of harsh directional light casting crisp shadows across textured interior surface. Tight framing. Cinematic editorial style. Sharp texture detail.",
        duration: 5,
      },
      {
        order: 3,
        name: "Finale",
        roomType: "exterior_back",
        imagePrompt:
          "Transform this photo into a cinematic editorial image with controlled, directional shadows. Inviting, well-lit, and polished.",
        videoPrompt:
          "Super smooth camera glides horizontally from left to right, parallel path, cinematic, revealing full exterior with golden hour lighting",
        duration: 5,
        textOverlay: { text: "{{price}}", position: "bottom-center", animation: "slide-up", startAt: 1, duration: 3 },
      },
    ],
  },
  {
    name: "Modern Vertical",
    slug: "modern-vertical",
    description:
      "TikTok/Reels optimized vertical format. Fast cuts, tight framing for social media engagement.",
    aspectRatio: "9:16",
    shots: [
      {
        order: 0,
        name: "Hero Shot",
        roomType: "exterior_front",
        imagePrompt:
          "Transform this photo into a cinematic editorial image with harsh, directional shadows. Correct perspective. Polished and cinematic.",
        videoPrompt:
          "Super smooth camera moves forward in straight line through space, cinematic, dramatic reveal of property exterior",
        duration: 3,
        textOverlay: { text: "{{address}}", position: "top-left", animation: "slide-up", startAt: 0, duration: 2.5 },
      },
      {
        order: 1,
        name: "Main Space",
        roomType: "living_room",
        imagePrompt:
          "Transform this photo into a cinematic editorial image with controlled, directional shadows. Bright and airy while retaining depth.",
        videoPrompt:
          "Very slow truck right, time-lapse light progression, camera slides laterally, parallax effect, consistent exposure, stable motion, cinematic, photorealistic",
        duration: 3,
      },
      {
        order: 2,
        name: "Kitchen",
        roomType: "kitchen",
        imagePrompt:
          "Cinematic detail shot of kitchen with light being cast - maintain white balance - soft bokeh.",
        videoPrompt:
          "Super smooth camera glides horizontally from right to left, parallel path, cinematic, kitchen reveal",
        duration: 3,
      },
      {
        order: 3,
        name: "Outdoor",
        roomType: "exterior_back",
        imagePrompt:
          "Transform this photo into a cinematic editorial image with harsh, directional shadows. Well-lit yet moody.",
        videoPrompt:
          "Super smooth camera descends in a straight line through space, cinematic, revealing outdoor area from above",
        duration: 3,
        textOverlay: { text: "{{price}}", position: "center", animation: "fade-in", startAt: 0.5, duration: 2 },
      },
    ],
  },
];

for (const style of styles) {
  const existing = await Style.findOne({ slug: style.slug });
  if (existing) {
    await Style.updateOne({ slug: style.slug }, style);
    console.log(`Updated: ${style.name}`);
  } else {
    await Style.create(style);
    console.log(`Created: ${style.name}`);
  }
}

console.log(`\nSeeded ${styles.length} styles`);
await mongoose.disconnect();
process.exit(0);
