import {
  ROOM_TYPES,
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

  const style = await Style.findById(project.style).lean();
  if (!style) throw new Error("Style not found");

  const shots = (style as any).shots || [];
  const sourceImages = project.sourceImages || [];

  // ── Classify with GPT-4o ──
  console.log(`[classify] classifying ${sourceImages.length} images…`);
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

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are a real estate photo classifier. Analyze each image and classify it into exactly one of these room types:
${ROOM_TYPES.join(", ")}

Rules:
- "exterior_front" = front of house/building
- "exterior_back" = backyard, rear view, patio with pool
- "detail" = close-up of a feature (fireplace, fixtures, countertop)
- "aerial" = drone/bird's eye view
- Choose the BEST matching category for each image
- Assign a confidence score from 0.0 to 1.0

Return JSON:
{
  "classifications": [
    { "index": 0, "roomType": "living_room", "confidence": 0.95 }
  ]
}

There are ${sourceImages.length} images.`,
          },
          ...imageContent,
        ],
      },
    ],
    max_tokens: 1000,
  });

  const parsed = JSON.parse(response.choices[0].message.content || "{}");
  const classifications = (
    parsed.classifications as Array<{
      index: number;
      roomType: string;
      confidence: number;
    }>
  ).map((c) => ({
    url: sourceImages[c.index]?.url,
    key: sourceImages[c.index]?.key,
    roomType: c.roomType,
    confidence: c.confidence,
  }));

  console.log(
    `[classify] results:`,
    classifications.map((c) => `${c.roomType}(${c.confidence})`)
  );

  // ── Match photos → shots ──
  const sorted = [...classifications].sort(
    (a, b) => b.confidence - a.confidence
  );
  const usedPhotos = new Set<string>();
  const matchedShots = new Set<number>();

  type Clip = {
    order: number;
    shotIndex: number;
    sourceImageUrl: string;
    roomType: string;
  };
  const clips: Clip[] = [];

  for (let i = 0; i < shots.length; i++) {
    const best = sorted.find(
      (c) => c.roomType === shots[i].roomType && !usedPhotos.has(c.url)
    );
    if (best) {
      clips.push({
        order: shots[i].order,
        shotIndex: i,
        sourceImageUrl: best.url,
        roomType: shots[i].roomType,
      });
      usedPhotos.add(best.url);
      matchedShots.add(i);
    }
  }

  for (let i = 0; i < shots.length; i++) {
    if (matchedShots.has(i)) continue;
    const next = sorted.find((c) => !usedPhotos.has(c.url));
    if (next) {
      clips.push({
        order: shots[i].order,
        shotIndex: i,
        sourceImageUrl: next.url,
        roomType: next.roomType,
      });
      usedPhotos.add(next.url);
    }
  }

  clips.sort((a, b) => a.order - b.order);

  if (clips.length === 0) {
    project.status = "failed";
    await project.save();
    throw new Error("No photos matched the style shots");
  }

  project.sourceImages = classifications.map((c) => ({
    url: c.url,
    key: c.key,
    classification: c.roomType,
    confidence: c.confidence,
  }));

  project.clips = clips.map((clip) => ({
    order: clip.order,
    shotIndex: clip.shotIndex,
    sourceImageUrl: clip.sourceImageUrl,
    imageJob: { status: "pending" },
    videoJob: { status: "pending" },
  }));

  project.status = "generating";
  project.progress = 10;
  project.markModified("sourceImages");
  project.markModified("clips");
  await project.save();

  console.log(`[classify] matched ${clips.length} clips, status → generating`);
  return projectId;
}
