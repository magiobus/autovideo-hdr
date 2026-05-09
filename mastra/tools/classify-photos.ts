import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import OpenAI from "openai";

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
] as const;

export const classifyPhotos = createTool({
  id: "classify-photos",
  description:
    "Classify real estate photos into room types using GPT-4o vision",
  inputSchema: z.object({
    imageUrls: z.array(z.string()).describe("Array of image URLs to classify"),
  }),
  outputSchema: z.object({
    classifications: z.array(
      z.object({
        url: z.string(),
        roomType: z.string(),
        confidence: z.number(),
      })
    ),
  }),
  execute: async ({ context }) => {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const imageContent = context.imageUrls.map((url: string) => ({
      type: "image_url" as const,
      image_url: { url, detail: "low" as const },
    }));

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
- "exterior_back" = backyard, rear view
- "detail" = close-up of a feature (fireplace, fixtures, countertop, etc.)
- "aerial" = drone/bird's eye view
- Choose the BEST matching category for each image
- Assign a confidence score from 0.0 to 1.0

Return JSON with this exact format:
{
  "classifications": [
    { "index": 0, "roomType": "living_room", "confidence": 0.95 },
    { "index": 1, "roomType": "kitchen", "confidence": 0.88 }
  ]
}

There are ${context.imageUrls.length} images to classify.`,
            },
            ...imageContent,
          ],
        },
      ],
      max_tokens: 1000,
    });

    const parsed = JSON.parse(response.choices[0].message.content || "{}");

    const classifications = parsed.classifications.map(
      (c: { index: number; roomType: string; confidence: number }) => ({
        url: context.imageUrls[c.index],
        roomType: c.roomType,
        confidence: c.confidence,
      })
    );

    return { classifications };
  },
});
