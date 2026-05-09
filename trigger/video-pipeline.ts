import { task, logger } from "@trigger.dev/sdk";
import { connectDB, getModels } from "./helpers";
import { classifyAndMatch } from "./steps/classify-and-match";
import { transformImages } from "./steps/transform-images";
import { generateVideos } from "./steps/generate-videos";
import { assemble } from "./steps/assemble";

export const videoPipelineTask = task({
  id: "video-pipeline",
  machine: {
    preset: "small-2x", // 1 vCPU, 1 GB RAM — enough for FFmpeg
  },
  run: async ({ projectId }: { projectId: string }) => {
    logger.info("Starting video pipeline", { projectId });

    await connectDB();

    // Step 1: Classify photos + match to style shots (~30s)
    logger.info("Step 1/4: classify-and-match");
    await classifyAndMatch(projectId);

    // Step 2: Transform images via Fal (1-5 min)
    logger.info("Step 2/4: transform-images");
    await transformImages(projectId);

    // Step 3: Generate videos via Fal (5-20 min)
    logger.info("Step 3/4: generate-videos");
    await generateVideos(projectId);

    // Step 4: Assemble final video — FFmpeg + voiceover + audio (2-10 min)
    logger.info("Step 4/4: assemble");
    await assemble(projectId);

    logger.info("Pipeline completed", { projectId });
    return { projectId, success: true };
  },
});
