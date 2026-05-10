import {
  connectDB,
  getModels,
  getOpenAI,
  downloadImageFromR2,
} from "../helpers";

export async function classifyAndMatch(projectId: string): Promise<string> {
  await connectDB();
  const { Project, Style } = await getModels();

  const project = await Project.findById(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  if (project.clips?.length > 0) {
    console.log(`[classify] existing clips found, skipping`);
    return projectId;
  }

  const style = await Style.findById(project.style).lean();
  if (!style) throw new Error("Style not found");

  const shots = (style as any).shots || [];
  const sourceImages = project.sourceImages || [];

  console.log(
    `[classify] ${sourceImages.length} photos → ${shots.length} shots`
  );

  // ── Download all images as base64 for GPT-4o ──
  const openai = getOpenAI();

  const imageContent = await Promise.all(
    sourceImages.map(async (img: any) => {
      const base64 = await downloadImageFromR2(img.key);
      return {
        type: "image_url" as const,
        image_url: {
          url: `data:image/jpeg;base64,${base64}`,
          detail: "low" as const,
        },
      };
    })
  );

  // ── Build shot descriptions for GPT-4o ──
  const shotDescriptions = shots
    .map(
      (s: any, i: number) =>
        `Shot ${i} "${s.name}" (${s.roomType}): ${getShotHint(s)}`
    )
    .join("\n");

  // ── Single GPT-4o call: classify + assign in one step ──
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are a professional real estate video editor. You have ${sourceImages.length} photos (numbered 0 to ${sourceImages.length - 1}) and ${shots.length} video shots to fill.

Each shot needs a specific type of photo. Your job is to assign the BEST photo to each shot, considering both the room type AND the composition/angle that each shot needs.

VIDEO SHOTS TO FILL:
${shotDescriptions}

RULES:
- Each photo can only be used ONCE
- Match room type first, then pick the best composition fit
- If two shots need the same room type (e.g. two "living_room" shots), assign DIFFERENT photos — pick the one whose angle/composition best fits each shot's description
- If no good match exists for a shot, skip it (don't force a bad match)
- A photo CAN be assigned to a shot with a different room type if the composition is a genuinely good fit and no better option exists
- Prioritize filling the most important shots: establishing (first), kitchen, primary suite, outdoor, closing

Also, for EVERY photo (not just assigned ones), describe the notable visual features you see — materials, textures, standout elements, views, lighting conditions. These will be used for the video narration, so focus on things that are visually interesting or would sell the property.

Return JSON:
{
  "assignments": [
    { "shotIndex": 0, "photoIndex": 3, "roomType": "exterior_front", "reason": "wide front view of the house" }
  ],
  "photoFeatures": [
    { "photoIndex": 0, "features": "open-concept living room with floor-to-ceiling windows, hardwood floors, mountain view through glass" },
    { "photoIndex": 1, "features": "modern kitchen with white marble island, brass fixtures, natural light from skylight" }
  ]
}

There are ${sourceImages.length} photos.`,
          },
          ...imageContent,
        ],
      },
    ],
    max_tokens: 3000,
  });

  const parsed = JSON.parse(response.choices[0].message.content || "{}");
  const assignments = parsed.assignments as Array<{
    shotIndex: number;
    photoIndex: number;
    roomType: string;
    reason: string;
  }>;
  const photoFeatures = (parsed.photoFeatures || []) as Array<{
    photoIndex: number;
    features: string;
  }>;

  if (!assignments || assignments.length === 0) {
    project.status = "failed";
    await project.save();
    throw new Error("GPT-4o returned no photo assignments");
  }

  // ── Log assignments ──
  for (const a of assignments) {
    const shotName = shots[a.shotIndex]?.name || `shot ${a.shotIndex}`;
    console.log(
      `[classify] photo ${a.photoIndex} → ${shotName} (${a.roomType}): ${a.reason}`
    );
  }

  // ── Log detected features ──
  for (const pf of photoFeatures) {
    console.log(`[classify] photo ${pf.photoIndex} features: ${pf.features}`);
  }

  // ── Validate: no duplicate photos, no duplicate shots ──
  const usedPhotos = new Set<number>();
  const usedShots = new Set<number>();
  const validAssignments = assignments.filter((a) => {
    if (
      a.photoIndex < 0 ||
      a.photoIndex >= sourceImages.length ||
      a.shotIndex < 0 ||
      a.shotIndex >= shots.length
    ) {
      return false;
    }
    if (usedPhotos.has(a.photoIndex) || usedShots.has(a.shotIndex)) {
      return false;
    }
    usedPhotos.add(a.photoIndex);
    usedShots.add(a.shotIndex);
    return true;
  });

  if (validAssignments.length === 0) {
    project.status = "failed";
    await project.save();
    throw new Error("No valid photo-to-shot assignments");
  }

  // ── Persist ──
  project.sourceImages = sourceImages.map((img: any, i: number) => {
    const assignment = validAssignments.find((a) => a.photoIndex === i);
    const pf = photoFeatures.find((f) => f.photoIndex === i);
    return {
      url: img.url,
      key: img.key,
      classification: assignment?.roomType || "unassigned",
      confidence: assignment ? 1.0 : 0,
      features: pf?.features || "",
    };
  });

  project.clips = validAssignments
    .sort((a, b) => shots[a.shotIndex].order - shots[b.shotIndex].order)
    .map((a) => ({
      order: shots[a.shotIndex].order,
      shotIndex: a.shotIndex,
      sourceImageUrl: sourceImages[a.photoIndex].url,
      transformPasses: [],
      imageJob: { status: "pending" },
      videoJob: { status: "pending" },
    }));

  project.status = "generating";
  project.progress = 10;
  project.markModified("sourceImages");
  project.markModified("clips");
  await project.save();

  console.log(
    `[classify] matched ${validAssignments.length}/${shots.length} shots, status → generating`
  );
  return projectId;
}

/**
 * Generate a human-readable hint for what kind of photo each shot needs.
 * This helps GPT-4o make better composition-aware assignments.
 */
function getShotHint(shot: any): string {
  const hints: Record<string, string> = {
    "Establishing Shot":
      "needs a wide, straight-on front view of the property exterior",
    "Entry Reveal":
      "needs a view from the entryway or doorway looking into the main living space",
    "Living Space Wide":
      "needs a wide lateral/side angle of the living area showing its full breadth",
    "Kitchen Hero":
      "needs a well-composed kitchen photo showing counters, island, or appliances",
    "Detail Shot":
      "needs a close-up of an interesting architectural detail, fixture, or texture",
    "Primary Suite":
      "needs a bedroom photo, ideally the largest/most impressive bedroom",
    "Bath Detail":
      "needs a bathroom photo focusing on vanity, fixtures, or tile work",
    "Outdoor Living":
      "needs a backyard, pool, patio, or outdoor entertainment area photo",
    "Closing Shot":
      "needs an exterior photo that works as a final impression — roofline, angled view, or dramatic perspective",
  };

  return hints[shot.name] || `needs a ${shot.roomType.replace(/_/g, " ")} photo`;
}
