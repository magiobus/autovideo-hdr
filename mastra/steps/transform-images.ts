import { createStep } from "@mastra/core/workflows";
import {
  stepIO,
  connectDB,
  configureFal,
  getModels,
  createPresignedDownloadUrl,
  downloadAndStoreToR2,
  sleep,
  fal,
  POLL_INTERVAL_MS,
  MAX_POLL_ATTEMPTS,
} from "../helpers";

export const transformImagesStep = createStep({
  id: "transform-images",
  ...stepIO,
  execute: async ({ inputData }) => {
    const { projectId } = inputData;
    await connectDB();
    configureFal();
    const { Project, Style } = await getModels();

    const project = await Project.findById(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const style = await Style.findById(project.style).lean();
    if (!style) throw new Error("Style not found");
    const shots = (style as any).shots || [];

    // ── Submit transform jobs ──
    let hasTransforms = false;
    console.log(`[transform] starting for ${project.clips.length} clips`);

    for (let i = 0; i < project.clips.length; i++) {
      const clip = project.clips[i];
      const shot = shots[clip.shotIndex];

      if (!shot?.imagePrompt) {
        clip.imageJob = { status: "completed" };
        console.log(`[transform] clip ${i}: no imagePrompt, skipping`);
        continue;
      }

      hasTransforms = true;

      try {
        const sourceImage = project.sourceImages.find(
          (img: any) => img.url === clip.sourceImageUrl
        );
        const downloadUrl = sourceImage?.key
          ? await createPresignedDownloadUrl(sourceImage.key)
          : clip.sourceImageUrl;

        const model = shot.imageModel || "fal-ai/nano-banana/edit";
        const result = await fal.queue.submit(model, {
          input: {
            image_urls: [downloadUrl],
            prompt: shot.imagePrompt,
            num_images: 1,
            output_format: "jpeg",
          },
        });

        if (!result?.request_id) {
          throw new Error("Fal submit returned no request_id");
        }

        clip.imageJob = {
          falRequestId: result.request_id,
          falModel: model,
          status: "processing",
          startedAt: new Date(),
        };
        console.log(`[transform] clip ${i} submitted: ${result.request_id} (model: ${model})`);
      } catch (err: any) {
        console.log(`[transform] clip ${i} submit FAILED: ${err.message}`);
        clip.imageJob = { status: "failed", error: err.message };
      }
    }

    project.markModified("clips");
    await project.save();

    if (!hasTransforms) {
      console.log(`[transform] no transforms needed`);
      return { projectId };
    }

    // ── Poll until all transforms complete ──
    console.log(`[transform] polling (interval: ${POLL_INTERVAL_MS}ms, max: ${MAX_POLL_ATTEMPTS})…`);

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);
      let allDone = true;

      for (let i = 0; i < project.clips.length; i++) {
        const clip = project.clips[i];
        if (clip.imageJob?.status !== "processing") continue;
        allDone = false;

        try {
          const status = await fal.queue.status(clip.imageJob.falModel, {
            requestId: clip.imageJob.falRequestId,
            logs: false,
          });
          const jobStatus = status.status as string;

          if (jobStatus === "COMPLETED") {
            const result = await fal.queue.result(clip.imageJob.falModel, {
              requestId: clip.imageJob.falRequestId,
            });
            const data = result.data as any;
            const imageUrl =
              data?.images?.[0]?.url || data?.output?.url || data?.image?.url;

            if (imageUrl) {
              const r2Key = `projects/${projectId}/transformed-${i}.jpg`;
              clip.transformedImageUrl = await downloadAndStoreToR2(
                imageUrl,
                r2Key,
                "image/jpeg"
              );
              console.log(`[transform] clip ${i} completed → ${r2Key}`);
            } else {
              console.log(`[transform] clip ${i} completed but no imageUrl in response`);
            }
            clip.imageJob.status = "completed";
            clip.imageJob.completedAt = new Date();
          } else if (jobStatus === "FAILED") {
            clip.imageJob.status = "failed";
            clip.imageJob.error = "Fal transform job failed";
            console.log(`[transform] clip ${i} FAILED (fal status: FAILED)`);
          } else {
            console.log(`[transform] clip ${i} still ${jobStatus} (attempt ${attempt + 1})`);
          }
        } catch (err: any) {
          console.log(`[transform] clip ${i} poll error: ${err.message}`);
          clip.imageJob.status = "failed";
          clip.imageJob.error = err.message;
        }
      }

      const totalClips = project.clips.length;
      const done = project.clips.filter(
        (c: any) =>
          c.imageJob?.status === "completed" || c.imageJob?.status === "failed"
      ).length;
      project.progress = 10 + Math.round((done / totalClips) * 20);
      project.markModified("clips");
      await project.save();

      if (allDone) break;
    }

    console.log(`[transform] phase done`);
    return { projectId };
  },
});
