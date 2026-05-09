import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { fal } from "@fal-ai/client";

export const transformImage = createTool({
  id: "transform-image",
  description: "Transform a photo using Fal image-to-image model (Nano Banana)",
  inputSchema: z.object({
    imageUrl: z.string(),
    prompt: z.string(),
    model: z.string().default("fal-ai/nano-banana/image-to-image"),
  }),
  outputSchema: z.object({
    requestId: z.string(),
    model: z.string(),
  }),
  execute: async ({ context }) => {
    fal.config({ credentials: process.env.FAL_KEY || process.env.FAL_API_KEY });

    const result = await fal.queue.submit(context.model, {
      input: {
        image_url: context.imageUrl,
        prompt: context.prompt,
      },
    });

    return {
      requestId: result.request_id,
      model: context.model,
    };
  },
});
