import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error(
    "Set MONGODB_URI env var. E.g.: source .env.local && node scripts/seed-styles.mjs"
  );
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
console.log("Connected to database");

// ── Inline schemas (avoids Next.js module resolution issues) ──

const imageTransformSchema = new mongoose.Schema(
  {
    order: Number,
    prompt: String,
    model: { type: String, default: "fal-ai/nano-banana/edit" },
  },
  { _id: false }
);

const shotSchema = new mongoose.Schema(
  {
    order: Number,
    name: String,
    roomType: String,
    imagePrompt: String,
    imageModel: { type: String, default: "fal-ai/nano-banana/edit" },
    imageTransforms: [imageTransformSchema],
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
    voiceover: {
      enabled: { type: Boolean, default: true },
      voice: { type: String, default: "shimmer" },
      speed: { type: Number, default: 0.95 },
    },
    shots: [shotSchema],
  },
  { timestamps: true }
);

const Style = mongoose.models.Style || mongoose.model("Style", styleSchema);

// ═══════════════════════════════════════════════════════════════════════
// CINEMATIC PRO — The one style to rule them all
//
// 9 shots, ~45s total. Based on research of top RE videographers
// (JT Visuals, Enes Yilmazer) + AI model benchmarks.
//
// Shot order follows pro convention:
//   Exterior hook → Entry reveal → Living wide → Kitchen hero →
//   Detail close-up → Primary suite → Bath detail → Outdoor → Closing
//
// Multi-pass transforms: composition first, then lighting/mood.
// 5s per clip = quality sweet spot for Kling v3 Pro.
// Slow movements only — fast = warping artifacts.
// ═══════════════════════════════════════════════════════════════════════

const cinematicPro = {
  name: "Cinematic Pro",
  slug: "cinematic-pro",
  description:
    "Professional 9-shot cinematic style. Multi-pass editorial transforms with slow, deliberate camera movements. Optimized for Kling v3 Pro. ~45 seconds.",
  aspectRatio: "16:9",
  voiceover: {
    enabled: true,
  },
  shots: [
    // ── 1. ESTABLISHING SHOT — First impression, sets the tone ──
    {
      order: 0,
      name: "Establishing Shot",
      roomType: "exterior_front",
      imageTransforms: [
        {
          order: 0,
          prompt:
            "Transform this photo into a cinematic editorial image with harsh, directional shadows and crisp light shaping. Correct any perspective distortion—ensure vertical lines are truly vertical and horizontal lines are level. Maintain the exact scene composition after correction and preserve the original white balance. Balance overall exposure with intention: raise midtones subtly for improved readability and presence, while preserving deep, sculpted shadow structure and strong contrast. The scene should feel polished and cinematic.",
          model: "fal-ai/nano-banana/edit",
        },
        {
          order: 1,
          prompt:
            "Apply intentional, filmic window pulls that reveal deep, rich exterior views—preserve sky density, environmental color, and contrast beyond the glass. Exterior scenes should feel dimensional and weighty, never washed out or pastel. Highlights must roll off smoothly with realistic falloff; avoid haloing, edge glow, or global tonal compression. Preserve all architectural details. Well-lit yet moody, polished and cinematic.",
          model: "fal-ai/nano-banana/edit",
        },
      ],
      videoPrompt:
        "Very slow dolly in, time-lapse light progression, camera moves forward in straight line toward the building, shadows gradually move and lengthen, parallax effect, consistent exposure, stable motion, cinematic, photorealistic",
      videoModel: "fal-ai/kling-video/v3/pro",
      duration: 5,
      textOverlay: {
        text: "{{address}}",
        position: "bottom-center",
        animation: "fade-in",
        startAt: 0.5,
        duration: 3,
      },
    },

    // ── 2. ENTRY REVEAL — Dolly in through the front, first interior impression ──
    {
      order: 1,
      name: "Entry Reveal",
      roomType: "living_room",
      imageTransforms: [
        {
          order: 0,
          prompt:
            "Transform this photo into a cinematic editorial image with controlled, directional shadows. Correct any perspective distortion—ensure vertical lines are truly vertical and horizontal lines are level. Maintain the exact scene composition after correction, preserve original white balance. Bright and airy while retaining depth and dimension. Shadows should add shape and drama without making the space feel dark or dingy. Preserve all architectural and interior details with clarity. The scene should feel inviting, well-lit, and polished.",
          model: "fal-ai/nano-banana/edit",
        },
        {
          order: 1,
          prompt:
            "Derive all lighting direction strictly from visible sources in the frame—windows, doors, architectural openings, and practical fixtures (lamps, sconces, pendants). Do not introduce light from walls or areas without logical entry points. Maintain strong tonal separation between interior shadows and exterior highlights; window views should read clear, saturated, and contrast-rich, while the interior retains depth, drama, and editorial punch.",
          model: "fal-ai/nano-banana/edit",
        },
      ],
      videoPrompt:
        "Wide interior shot with a slow and smooth dolly in. Camera moves forward in straight line revealing the full space. Dramatic shadows crawl and shift across furnishings. Editorial film style. Neutral white balance, balanced exposure — deep shadows without underexposure. Smooth forward motion. Atmospheric architectural cinematography.",
      videoModel: "fal-ai/kling-video/v3/pro",
      duration: 5,
    },

    // ── 3. LIVING SPACE WIDE — Lateral slider to show scale and flow ──
    {
      order: 2,
      name: "Living Space Wide",
      roomType: "living_room",
      imageTransforms: [
        {
          order: 0,
          prompt:
            "Transform this photo into a cinematic editorial image with harsh, directional shadows and crisp light shaping. Correct any perspective distortion—ensure vertical lines are truly vertical and horizontal lines are level. Preserve the original white balance. Balance overall exposure: raise interior midtones subtly, preserve deep sculpted shadow structure. Apply filmic window pulls revealing deep rich exterior views. Polished and cinematic.",
          model: "fal-ai/nano-banana/edit",
        },
      ],
      videoPrompt:
        "Wide interior shot with very slow trucking movement side to side as harsh directional light moves and expands across modern living space. Dramatic shadows crawl and shift across sofa, wood paneling, walls, and furnishings. Crisp shadow edges in motion. Camera tracks laterally through scene while light travels. Editorial film style. Neutral white balance, balanced exposure — deep shadows without underexposure. Smooth parallel motion. Atmospheric architectural cinematography.",
      videoModel: "fal-ai/kling-video/v3/pro",
      duration: 5,
    },

    // ── 4. KITCHEN HERO — The room buyers evaluate most ──
    {
      order: 3,
      name: "Kitchen Hero",
      roomType: "kitchen",
      imageTransforms: [
        {
          order: 0,
          prompt:
            "Transform this photo into a cinematic editorial image with controlled, directional shadows. Correct any perspective distortion—ensure vertical lines are truly vertical and horizontal lines are level. Bright and airy while retaining depth and dimension. Preserve all architectural and interior details with clarity. The scene should feel inviting, well-lit, and polished. Derive all lighting direction from visible sources in the frame.",
          model: "fal-ai/nano-banana/edit",
        },
        {
          order: 1,
          prompt:
            "85mm close up detail shot of the main feature in the room. Cinematic editorial style. Neutral white balance, balanced exposure — deep shadows without underexposure. Sharp texture detail in wood grain, stone countertops, or architectural elements. Preserve all details.",
          model: "fal-ai/nano-banana/edit",
        },
      ],
      videoPrompt:
        "Very slow truck right, time-lapse light progression, camera slides laterally while light shifts across the space, shadows gradually move and lengthen, parallax effect, consistent exposure, stable motion, cinematic, photorealistic",
      videoModel: "fal-ai/kling-video/v3/pro",
      duration: 5,
    },

    // ── 5. DETAIL SHOT — Close-up texture, the "goosebumps" moment ──
    {
      order: 4,
      name: "Detail Shot",
      roomType: "detail",
      imageTransforms: [
        {
          order: 0,
          prompt:
            "Cinematic close up detail shot - maintain white balance - soft bokeh - preserve all architectural and interior details.",
          model: "fal-ai/nano-banana/edit",
        },
      ],
      videoPrompt:
        "Extreme close-up detail shot with smooth tracking camera following harsh directional light as it grows and spreads across textured surface. Crisp shadow edges crawl and shift in real time. Camera moves with the light's path revealing texture in wood grain, fabric weave, architectural detail. Editorial film style. Neutral white balance, balanced exposure — deep dramatic shadows without underexposure. Shallow depth of field.",
      videoModel: "fal-ai/kling-video/v3/pro",
      duration: 5,
    },

    // ── 6. PRIMARY SUITE — Slow dolly in, show the master bedroom ──
    {
      order: 5,
      name: "Primary Suite",
      roomType: "bedroom",
      imageTransforms: [
        {
          order: 0,
          prompt:
            "Transform this photo into a cinematic editorial image with harsh, directional shadows. Correct any perspective distortion—ensure vertical lines are truly vertical and horizontal lines are level. Maintain the exact scene composition after correction, preserve original white balance, and ensure the overall exposure remains balanced—shadows should be dramatic but the image should not appear underexposed or muddy. Preserve all architectural and interior details. The scene should feel well-lit yet moody.",
          model: "fal-ai/nano-banana/edit",
        },
        {
          order: 1,
          prompt:
            "Derive all lighting direction from visible sources in the frame: windows, doors, architectural openings, and any practical fixtures (lamps, sconces, pendants). Do not introduce light from walls or areas without logical entry points. The scene should feel well-lit yet moody, polished and cinematic.",
          model: "fal-ai/nano-banana/edit",
        },
      ],
      videoPrompt:
        "Wide interior shot with a slow and smooth dolly in. Dramatic shadows crawl and shift across bed, furnishings, and walls. Editorial film style. Neutral white balance, balanced exposure. Smooth forward motion. Atmospheric architectural cinematography.",
      videoModel: "fal-ai/kling-video/v3/pro",
      duration: 5,
    },

    // ── 7. BATH DETAIL — Tight tracking on textures and fixtures ──
    {
      order: 6,
      name: "Bath Detail",
      roomType: "bathroom",
      imageTransforms: [
        {
          order: 0,
          prompt:
            "85mm close up detail shot of light being cast onto the bathroom cabinets. Cinematic editorial style. Neutral white balance, balanced exposure — deep shadows without underexposure. Sharp texture detail in wood grain, marble, tile, or architectural elements.",
          model: "fal-ai/nano-banana/edit",
        },
      ],
      videoPrompt:
        "Tight interior shot with slow trucking movement side to side. Dramatic shadows crawl and shift across bathroom surfaces. Crisp shadow edges in motion. Camera tracks laterally. Editorial film style. Neutral white balance, balanced exposure — deep shadows without underexposure. Smooth parallel motion.",
      videoModel: "fal-ai/kling-video/v3/pro",
      duration: 5,
    },

    // ── 8. OUTDOOR LIVING — Orbit to show the backyard/pool lifestyle ──
    {
      order: 7,
      name: "Outdoor Living",
      roomType: "exterior_back",
      imageTransforms: [
        {
          order: 0,
          prompt:
            "Transform this photo into a cinematic editorial image with harsh, directional shadows and crisp light shaping. Correct any perspective distortion. Preserve all architectural and landscaping details. Well-lit yet moody, polished and cinematic. Rich sky density and environmental color.",
          model: "fal-ai/nano-banana/edit",
        },
      ],
      videoPrompt:
        "Super smooth camera travels in arc around subject, subject stays centered, sky hyperlapses naturally in the background, cinematic, photorealistic, stable motion, consistent exposure",
      videoModel: "fal-ai/kling-video/v3/pro",
      duration: 5,
    },

    // ── 9. CLOSING SHOT — Pull back, final impression with price ──
    {
      order: 8,
      name: "Closing Shot",
      roomType: "exterior_front",
      imageTransforms: [
        {
          order: 0,
          prompt:
            "Generate a 50mm detail shot looking upward at the roofline with sharp architectural edges composed aesthetically against the sky. Sharp focus on roof edges with natural cloud formations in background. Frame the composition to emphasize the geometric shapes and lines of the roofline in a visually compelling arrangement. Preserve exact architecture, materials, and building details.",
          model: "fal-ai/nano-banana/edit",
        },
      ],
      videoPrompt:
        "Super smooth camera rises vertically upward, straight vertical path, cinematic, revealing architecture against sky, stable motion, consistent exposure, photorealistic",
      videoModel: "fal-ai/kling-video/v3/pro",
      duration: 5,
      textOverlay: {
        text: "{{price}}",
        position: "bottom-center",
        animation: "fade-in",
        startAt: 1,
        duration: 3,
      },
    },
  ],
};

// ── Seed logic ──

// Delete old styles that we're replacing
const oldSlugs = ["golden-hour-cinematic", "editorial-luxury", "modern-vertical"];
const deleted = await Style.deleteMany({ slug: { $in: oldSlugs } });
if (deleted.deletedCount > 0) {
  console.log(`Deleted ${deleted.deletedCount} old style(s)`);
}

// Upsert the one style
const existing = await Style.findOne({ slug: cinematicPro.slug });
if (existing) {
  await Style.updateOne({ slug: cinematicPro.slug }, cinematicPro);
  console.log(`Updated: ${cinematicPro.name}`);
} else {
  await Style.create(cinematicPro);
  console.log(`Created: ${cinematicPro.name}`);
}

console.log(`\nDone — 1 style active: "${cinematicPro.name}" (${cinematicPro.shots.length} shots)`);
await mongoose.disconnect();
process.exit(0);
