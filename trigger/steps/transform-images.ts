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
import { resolveTransforms } from "@/libs/pipeline/resolve-transforms";

export async function transformImages(projectId: string): Promise<string> {
  await connectDB();
  configureFal();
  const { Project, Style } = await getModels();

  const project = await Project.findById(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const style = await Style.findById(project.style).lean();
  if (!style) throw new Error("Style not found");
  const shots = (style as any).shots || [];

  // ── Resolve transforms per clip ──
  const clipTransforms: { clipIndex: number; passes: ReturnType<typeof resolveTransforms> }[] = [];
  let maxPasses = 0;

  for (let i = 0; i < project.clips.length; i++) {
    const shot = shots[project.clips[i].shotIndex];
    const passes = shot ? resolveTransforms(shot) : [];
    clipTransforms.push({ clipIndex: i, passes });
    maxPasses = Math.max(maxPasses, passes.length);

    if (passes.length === 0) {
      project.clips[i].imageJob = { status: "completed" };
      project.clips[i].transformPasses = [];
      console.log(`[transform] clip ${i}: no transforms, skipping`);
    } else if (!Array.isArray(project.clips[i].transformPasses)) {
      project.clips[i].transformPasses = [];
    }
  }

  project.markModified("clips");
  await project.save();

  if (maxPasses === 0) {
    console.log(`[transform] no transforms needed`);
    return projectId;
  }

  const totalPasses = clipTransforms.reduce((sum, ct) => sum + ct.passes.length, 0);

  console.log(`[transform] ${project.clips.length} clips, max ${maxPasses} passes, ${totalPasses} total jobs`);

  // ── Wave-based multi-pass: execute all clips' pass N, then pass N+1, etc. ──
  for (let passIndex = 0; passIndex < maxPasses; passIndex++) {
    console.log(`[transform] === pass ${passIndex} ===`);

    // Submit jobs for all clips that have this pass
    let hasJobs = false;
    for (const ct of clipTransforms) {
      if (passIndex >= ct.passes.length) continue;
      const clip = project.clips[ct.clipIndex];

      // Skip if a previous pass failed
      if (clip.imageJob?.status === "failed") {
        continue;
      }

      const existingPass = clip.transformPasses[passIndex];
      if (existingPass?.job?.status === "completed" && existingPass.outputR2Key) {
        if (passIndex === ct.passes.length - 1 && !clip.transformedImageUrl) {
          clip.transformedImageUrl = existingPass.outputImageUrl;
          clip.imageJob = { status: "completed", completedAt: existingPass.job.completedAt || new Date() };
        }
        continue;
      }
      if (existingPass?.job?.status === "processing") {
        hasJobs = true;
        continue;
      }
      if (existingPass?.job?.status === "failed") {
        clip.imageJob = { status: "failed", error: existingPass.job.error || `Pass ${passIndex} failed` };
        continue;
      }

      const pass = ct.passes[passIndex];
      hasJobs = true;

      try {
        // Determine input image: pass 0 = source, pass N = output of pass N-1
        let inputImageUrl: string;
        if (passIndex === 0) {
          const sourceImage = project.sourceImages.find(
            (img: any) => img.url === clip.sourceImageUrl
          );
          inputImageUrl = sourceImage?.key
            ? await createPresignedDownloadUrl(sourceImage.key)
            : clip.sourceImageUrl;
        } else {
          const prevPass = clip.transformPasses[passIndex - 1];
          if (!prevPass?.outputR2Key) {
            throw new Error(`No output from pass ${passIndex - 1}`);
          }
          inputImageUrl = await createPresignedDownloadUrl(prevPass.outputR2Key);
        }

        const result = await fal.queue.submit(pass.model, {
          input: {
            image_urls: [inputImageUrl],
            prompt: pass.prompt,
            num_images: 1,
            output_format: "jpeg",
          },
        });

        if (!result?.request_id) {
          throw new Error("Fal submit returned no request_id");
        }

        // Track this pass
        const passRecord: any = {
          order: passIndex,
          inputImageUrl,
          job: {
            falRequestId: result.request_id,
            falModel: pass.model,
            status: "processing",
            startedAt: new Date(),
          },
        };
        clip.transformPasses.push(passRecord);

        // Update overall imageJob to reflect current state
        clip.imageJob = {
          falRequestId: result.request_id,
          falModel: pass.model,
          status: "processing",
          startedAt: new Date(),
        };

        console.log(`[transform] clip ${ct.clipIndex} pass ${passIndex} submitted: ${result.request_id}`);
      } catch (err: any) {
        console.log(`[transform] clip ${ct.clipIndex} pass ${passIndex} submit FAILED: ${err.message}`);
        clip.imageJob = { status: "failed", error: err.message };
      }
    }

    project.markModified("clips");
    await project.save();

    if (!hasJobs) continue;

    // ── Poll until all jobs for this pass complete ──
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);
      let allDone = true;

      for (const ct of clipTransforms) {
        if (passIndex >= ct.passes.length) continue;
        const clip = project.clips[ct.clipIndex];
        const passRecord = clip.transformPasses[passIndex];
        if (!passRecord?.job || passRecord.job.status !== "processing") continue;
        allDone = false;

        try {
          const status = await fal.queue.status(passRecord.job.falModel, {
            requestId: passRecord.job.falRequestId,
            logs: false,
          });
          const jobStatus = status.status as string;

          if (jobStatus === "COMPLETED") {
            const result = await fal.queue.result(passRecord.job.falModel, {
              requestId: passRecord.job.falRequestId,
            });
            const data = result.data as any;
            const imageUrl =
              data?.images?.[0]?.url || data?.output?.url || data?.image?.url;

            if (imageUrl) {
              const r2Key = `projects/${projectId}/transformed-${ct.clipIndex}-pass-${passIndex}.jpg`;
              const publicUrl = await downloadAndStoreToR2(imageUrl, r2Key, "image/jpeg");
              passRecord.outputImageUrl = publicUrl;
              passRecord.outputR2Key = r2Key;
              console.log(`[transform] clip ${ct.clipIndex} pass ${passIndex} completed -> ${r2Key}`);
            } else {
              console.log(`[transform] clip ${ct.clipIndex} pass ${passIndex} completed but no imageUrl`);
            }
            passRecord.job.status = "completed";
            passRecord.job.completedAt = new Date();

            // If this is the final pass, set transformedImageUrl + backward compat key
            if (passIndex === ct.passes.length - 1 && passRecord.outputImageUrl) {
              clip.transformedImageUrl = passRecord.outputImageUrl;
              clip.imageJob = { status: "completed", completedAt: new Date() };

              // Also store at the legacy key for generate-videos compat
              if (passRecord.outputR2Key !== `projects/${projectId}/transformed-${ct.clipIndex}.jpg`) {
                await downloadAndStoreToR2(
                  passRecord.outputImageUrl,
                  `projects/${projectId}/transformed-${ct.clipIndex}.jpg`,
                  "image/jpeg"
                );
              }
            }
          } else if (jobStatus === "FAILED") {
            passRecord.job.status = "failed";
            passRecord.job.error = "Fal transform job failed";
            clip.imageJob = { status: "failed", error: `Pass ${passIndex} failed` };
            console.log(`[transform] clip ${ct.clipIndex} pass ${passIndex} FAILED`);
          } else {
            console.log(`[transform] clip ${ct.clipIndex} pass ${passIndex} still ${jobStatus} (attempt ${attempt + 1})`);
          }
        } catch (err: any) {
          console.log(`[transform] clip ${ct.clipIndex} pass ${passIndex} poll error: ${err.message}`);
          passRecord.job.status = "failed";
          passRecord.job.error = err.message;
          clip.imageJob = { status: "failed", error: err.message };
        }
      }

      const completedPasses = countDonePasses(project.clips, clipTransforms);
      project.progress = 10 + Math.round((completedPasses / totalPasses) * 20);
      project.markModified("clips");
      await project.save();

      if (allDone) break;
    }
  }

  let failedCount = 0;
  for (const ct of clipTransforms) {
    if (ct.passes.length === 0) continue;
    const clip = project.clips[ct.clipIndex];
    for (let passIndex = 0; passIndex < ct.passes.length; passIndex++) {
      const passRecord = clip.transformPasses[passIndex];
      if (passRecord?.job?.status === "processing") {
        passRecord.job.status = "failed";
        passRecord.job.error = "Timed out waiting for Fal transform job";
        clip.imageJob = { status: "failed", error: `Pass ${passIndex} timed out` };
      }
    }
    const finalPass = clip.transformPasses[ct.passes.length - 1];
    if (finalPass?.job?.status !== "completed" || !finalPass.outputR2Key) {
      failedCount++;
      if (clip.imageJob?.status !== "failed") {
        clip.imageJob = { status: "failed", error: "Image transform did not complete" };
      }
    }
  }

  project.progress = 10 + Math.round((countDonePasses(project.clips, clipTransforms) / totalPasses) * 20);
  project.markModified("clips");
  await project.save();

  if (failedCount > 0) {
    project.status = "failed";
    await project.save();
    throw new Error(`${failedCount} image transform clip(s) failed`);
  }

  console.log(`[transform] all passes done`);
  return projectId;
}

function countDonePasses(clips: any[], clipTransforms: { clipIndex: number; passes: ReturnType<typeof resolveTransforms> }[]) {
  let done = 0;
  for (const ct of clipTransforms) {
    const clip = clips[ct.clipIndex];
    for (let passIndex = 0; passIndex < ct.passes.length; passIndex++) {
      const status = clip.transformPasses?.[passIndex]?.job?.status;
      if (status === "completed" || status === "failed") done++;
    }
  }
  return done;
}
