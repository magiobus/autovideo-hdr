import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import OpenAI from "openai";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const ROOM_TYPES = [
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
];

// Step 1: Classify photos using GPT-4o vision
// Download image from R2 using S3 SDK (public URLs may not work)
async function downloadImageFromR2(key: string): Promise<string> {
  const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const result = await r2.send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    })
  );

  const chunks: Uint8Array[] = [];
  for await (const chunk of result.Body as any) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  return buffer.toString("base64");
}

const classifyStep = createStep({
  id: "classify",
  inputSchema: z.object({
    imageUrls: z.array(z.string()),
    imageKeys: z.array(z.string()),
    shots: z.array(
      z.object({
        order: z.number(),
        roomType: z.string(),
        name: z.string().optional(),
      })
    ),
  }),
  outputSchema: z.object({
    classifications: z.array(
      z.object({
        url: z.string(),
        roomType: z.string(),
        confidence: z.number(),
      })
    ),
    shots: z.array(
      z.object({
        order: z.number(),
        roomType: z.string(),
        name: z.string().optional(),
      })
    ),
  }),
  execute: async ({ inputData }) => {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Download images from R2 via S3 SDK and convert to base64
    const imageContent = await Promise.all(
      inputData.imageKeys.map(async (key: string) => {
        const base64 = await downloadImageFromR2(key);
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

There are ${inputData.imageUrls.length} images.`,
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
      url: inputData.imageUrls[c.index],
      roomType: c.roomType,
      confidence: c.confidence,
    }));

    return {
      classifications,
      shots: inputData.shots,
    };
  },
});

// Step 2: Match photos to style shots
const matchStep = createStep({
  id: "match",
  inputSchema: z.object({
    classifications: z.array(
      z.object({
        url: z.string(),
        roomType: z.string(),
        confidence: z.number(),
      })
    ),
    shots: z.array(
      z.object({
        order: z.number(),
        roomType: z.string(),
        name: z.string().optional(),
      })
    ),
  }),
  outputSchema: z.object({
    clips: z.array(
      z.object({
        order: z.number(),
        shotIndex: z.number(),
        sourceImageUrl: z.string(),
        roomType: z.string(),
      })
    ),
    unmatchedPhotos: z.array(z.string()),
    unmatchedShots: z.array(z.number()),
  }),
  execute: async ({ inputData }) => {
    const { classifications, shots } = inputData;
    const clips: Array<{
      order: number;
      shotIndex: number;
      sourceImageUrl: string;
      roomType: string;
    }> = [];
    const usedPhotos = new Set<string>();
    const matchedShotIndices = new Set<number>();

    const sorted = [...classifications].sort(
      (a, b) => b.confidence - a.confidence
    );

    // Pass 1: Exact roomType matches
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const bestMatch = sorted.find(
        (c) => c.roomType === shot.roomType && !usedPhotos.has(c.url)
      );

      if (bestMatch) {
        clips.push({
          order: shot.order,
          shotIndex: i,
          sourceImageUrl: bestMatch.url,
          roomType: shot.roomType,
        });
        usedPhotos.add(bestMatch.url);
        matchedShotIndices.add(i);
      }
    }

    // Pass 2: Fill unmatched shots with remaining photos (best available)
    const unmatchedShotIndices = shots
      .map((_, i) => i)
      .filter((i) => !matchedShotIndices.has(i));

    for (const shotIdx of unmatchedShotIndices) {
      const nextPhoto = sorted.find((c) => !usedPhotos.has(c.url));
      if (nextPhoto) {
        clips.push({
          order: shots[shotIdx].order,
          shotIndex: shotIdx,
          sourceImageUrl: nextPhoto.url,
          roomType: nextPhoto.roomType,
        });
        usedPhotos.add(nextPhoto.url);
        matchedShotIndices.add(shotIdx);
      }
    }

    clips.sort((a, b) => a.order - b.order);

    // Extra photos beyond the style's shot count are ignored (style defines video structure)
    const unmatchedPhotos = classifications
      .filter((c) => !usedPhotos.has(c.url))
      .map((c) => c.url);
    const unmatchedShots = shots
      .map((_, i) => i)
      .filter((i) => !matchedShotIndices.has(i));

    return { clips, unmatchedPhotos, unmatchedShots };
  },
});

export const videoGenerationWorkflow = createWorkflow({
  id: "video-generation",
  inputSchema: z.object({
    imageUrls: z.array(z.string()),
    imageKeys: z.array(z.string()),
    shots: z.array(
      z.object({
        order: z.number(),
        roomType: z.string(),
        name: z.string().optional(),
      })
    ),
  }),
  outputSchema: z.object({
    clips: z.array(
      z.object({
        order: z.number(),
        shotIndex: z.number(),
        sourceImageUrl: z.string(),
        roomType: z.string(),
      })
    ),
    unmatchedPhotos: z.array(z.string()),
    unmatchedShots: z.array(z.number()),
  }),
})
  .then(classifyStep)
  .then(matchStep)
  .commit();
