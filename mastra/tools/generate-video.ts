import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { fal } from "@fal-ai/client";

export const generateVideo = createTool({
  id: "generate-video",
  description: "Generate a video from an image using Fal image-to-video model",
  inputSchema: z.object({
    imageUrl: z.string(),
    prompt: z.string(),
    model: z.string().default("fal-ai/kling-video/v3/pro"),
    duration: z.number().default(5),
    aspectRatio: z.string().default("16:9"),
  }),
  outputSchema: z.object({
    requestId: z.string(),
    model: z.string(),
  }),
  execute: async ({ context }) => {
    fal.config({ credentials: process.env.FAL_KEY || process.env.FAL_API_KEY });

    const result = await fal.queue.submit(context.model, {
      input: {
        prompt: context.prompt,
        image_url: context.imageUrl,
        duration: context.duration,
        aspect_ratio: context.aspectRatio,
      },
    });

    return {
      requestId: result.request_id,
      model: context.model,
    };
  },
});
