import { Mastra } from "@mastra/core";
import { videoGenerationWorkflow } from "./workflows/video-generation";

export const mastra = new Mastra({
  workflows: {
    videoGenerationWorkflow,
  },
});
