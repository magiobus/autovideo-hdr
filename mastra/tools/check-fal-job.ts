import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { fal } from "@fal-ai/client";

export const checkFalJob = createTool({
  id: "check-fal-job",
  description: "Check the status of a Fal API job and get result if completed",
  inputSchema: z.object({
    model: z.string(),
    requestId: z.string(),
  }),
  outputSchema: z.object({
    status: z.enum(["IN_QUEUE", "IN_PROGRESS", "COMPLETED", "FAILED"]),
    resultUrl: z.string().optional(),
  }),
  execute: async ({ context }) => {
    fal.config({ credentials: process.env.FAL_KEY || process.env.FAL_API_KEY });

    const status = await fal.queue.status(context.model, {
      requestId: context.requestId,
      logs: false,
    });

    if (status.status === "COMPLETED") {
      const result = await fal.queue.result(context.model, {
        requestId: context.requestId,
      });

      // Fal returns different shapes — video models return .video.url, image models return .images[0].url
      const data = result.data as any;
      const resultUrl =
        data?.video?.url || data?.images?.[0]?.url || data?.output?.url || null;

      return {
        status: "COMPLETED" as const,
        resultUrl: resultUrl || undefined,
      };
    }

    return {
      status: status.status as
        | "IN_QUEUE"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "FAILED",
    };
  },
});
