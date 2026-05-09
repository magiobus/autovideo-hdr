import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const matchPhotosToShots = createTool({
  id: "match-photos-to-shots",
  description:
    "Match classified photos to style shots based on room type. Pure logic, no AI.",
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
  execute: async ({ context }) => {
    const { classifications, shots } = context;
    const clips: Array<{
      order: number;
      shotIndex: number;
      sourceImageUrl: string;
      roomType: string;
    }> = [];
    const usedPhotos = new Set<string>();
    const matchedShotIndices = new Set<number>();

    // Sort classifications by confidence (highest first)
    const sorted = [...classifications].sort(
      (a, b) => b.confidence - a.confidence
    );

    // For each shot, find the best matching photo
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

    // Sort clips by shot order
    clips.sort((a, b) => a.order - b.order);

    const unmatchedPhotos = classifications
      .filter((c) => !usedPhotos.has(c.url))
      .map((c) => c.url);

    const unmatchedShots = shots
      .map((_, i) => i)
      .filter((i) => !matchedShotIndices.has(i));

    return { clips, unmatchedPhotos, unmatchedShots };
  },
});
