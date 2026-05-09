import {
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

export async function generateVideos(projectId: string): Promise<string> {
  await connectDB();
  configureFal();
  const { Project, Style } = await getModels();

  const project = await Project.findById(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const style = await Style.findById(project.style).lean();
  if (!style) throw new Error("Style not found");
  const shots = (style as any).shots || [];

  console.log(`[videogen] starting for ${project.clips.length} clips, ${shots.length} shots`);

  for (let i = 0; i < project.clips.length; i++) {
    const clip = project.clips[i];
    const shot = shots[clip.shotIndex];

    if (!shot) {
      console.log(`[videogen] clip ${i}: no shot at index ${clip.shotIndex}`);
      clip.videoJob = { status: "failed", error: `No shot at index ${clip.shotIndex}` };
      continue;
    }

    if (shot.imagePrompt && clip.imageJob?.status === "failed") {
      console.log(`[videogen] clip ${i}: skipping — transform failed`);
      clip.videoJob = { status: "failed", error: "Skipped: image transform failed" };
      continue;
    }

    try {
      let videoSourceUrl: string;
      if (clip.transformedImageUrl) {
        const transformedKey = `projects/${projectId}/transformed-${i}.jpg`;
        try {
          videoSourceUrl = await createPresignedDownloadUrl(transformedKey);
        } catch {
          videoSourceUrl = clip.transformedImageUrl;
        }
      } else {
        const sourceImage = project.sourceImages?.find(
          (img: any) => img.url === clip.sourceImageUrl
        );
        videoSourceUrl = sourceImage?.key
          ? await createPresignedDownloadUrl(sourceImage.key)
          : clip.sourceImageUrl;
      }

      if (!videoSourceUrl) {
        throw new Error("No source image URL available");
      }

      const model = shot.videoModel || "fal-ai/kling-video/v3/pro";
      const isKling = model.includes("kling-video");
      const endpoint =
        isKling && !model.includes("image-to-video")
          ? `${model}/image-to-video`
          : model;

      const prompt = clip.customVideoPrompt || shot.videoPrompt || "";
      const duration = String(clip.customDuration || shot.duration || 5);

      const input = isKling
        ? {
            prompt,
            start_image_url: videoSourceUrl,
            duration,
            negative_prompt: "blur, distort, and low quality",
            cfg_scale: 0.5,
          }
        : {
            prompt,
            image_url: videoSourceUrl,
            duration,
            aspect_ratio: (style as any).aspectRatio || "16:9",
          };

      console.log(`[videogen] clip ${i}: submitting to ${endpoint}`);
      const result = await fal.queue.submit(endpoint, { input });

      if (!result?.request_id) {
        throw new Error(`Fal submit returned no request_id`);
      }

      clip.videoJob = {
        falRequestId: result.request_id,
        falModel: endpoint,
        status: "processing",
        startedAt: new Date(),
      };
      console.log(`[videogen] clip ${i} submitted: ${result.request_id}`);
    } catch (err: any) {
      console.log(`[videogen] clip ${i} submit FAILED: ${err.message}`);
      clip.videoJob = { status: "failed", error: err.message };
    }
  }

  project.markModified("clips");
  await project.save();

  console.log(`[videogen] polling…`);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);
    let allDone = true;

    for (let i = 0; i < project.clips.length; i++) {
      const clip = project.clips[i];
      if (clip.videoJob?.status !== "processing") continue;
      allDone = false;

      try {
        const status = await fal.queue.status(clip.videoJob.falModel, {
          requestId: clip.videoJob.falRequestId,
          logs: false,
        });
        const jobStatus = status.status as string;

        if (jobStatus === "COMPLETED") {
          const result = await fal.queue.result(clip.videoJob.falModel, {
            requestId: clip.videoJob.falRequestId,
          });
          const data = result.data as any;
          const videoUrl = data?.video?.url || data?.output?.url;

          if (videoUrl) {
            const r2Key = `projects/${projectId}/clip-${i}.mp4`;
            clip.videoUrl = await downloadAndStoreToR2(videoUrl, r2Key, "video/mp4");
            console.log(`[videogen] clip ${i} completed → ${r2Key}`);
          } else {
            console.log(`[videogen] clip ${i} completed but no videoUrl in response`);
          }
          clip.videoJob.status = "completed";
          clip.videoJob.completedAt = new Date();
        } else if (jobStatus === "FAILED") {
          clip.videoJob.status = "failed";
          clip.videoJob.error = "Fal video job failed";
          console.log(`[videogen] clip ${i} FAILED`);
        } else {
          console.log(`[videogen] clip ${i} still ${jobStatus} (attempt ${attempt + 1})`);
        }
      } catch (err: any) {
        console.log(`[videogen] clip ${i} poll error: ${err.message}`);
        clip.videoJob.status = "failed";
        clip.videoJob.error = err.message;
      }
    }

    const done = project.clips.filter(
      (c: any) =>
        c.videoJob?.status === "completed" || c.videoJob?.status === "failed"
    ).length;
    project.progress = 30 + Math.round((done / project.clips.length) * 55);
    project.markModified("clips");
    await project.save();

    if (allDone) break;
  }

  const completedCount = project.clips.filter(
    (c: any) => c.videoJob?.status === "completed" && c.videoUrl
  ).length;

  if (completedCount === 0) {
    project.status = "failed";
    project.markModified("clips");
    await project.save();
    throw new Error("All video generation jobs failed");
  }

  console.log(`[videogen] done: ${completedCount}/${project.clips.length} succeeded`);
  return projectId;
}
