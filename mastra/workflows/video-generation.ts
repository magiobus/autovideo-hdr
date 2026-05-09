import { createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { classifyAndMatchStep } from "../steps/classify-and-match";
import { transformImagesStep } from "../steps/transform-images";
import { generateVideosStep } from "../steps/generate-videos";
import { assembleStep } from "../steps/assemble";

export const videoGenerationWorkflow = createWorkflow({
  id: "video-generation",
  inputSchema: z.object({ projectId: z.string() }),
  outputSchema: z.object({
    projectId: z.string(),
    finalVideoUrl: z.string().optional(),
  }),
})
  .then(classifyAndMatchStep)
  .then(transformImagesStep)
  .then(generateVideosStep)
  .then(assembleStep)
  .commit();
