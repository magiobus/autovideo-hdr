import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import connectDB from "@/libs/mongoose";
import Project from "@/models/Project";
import Style from "@/models/Style";
import {
  submitImageTransform,
  submitVideoGeneration,
  checkJob,
  getJobResult,
} from "@/libs/fal";
import { downloadAndStoreToR2 } from "@/helpers/downloadAndStoreToR2";
import { createPresignedDownloadUrl } from "@/libs/r2";

export async function POST(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const { id } = await params;
  const project = await Project.findOne({
    _id: id,
    user: session.user.id,
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.status === "completed" || project.status === "failed") {
    return NextResponse.json(project.toJSON());
  }

  const style = await Style.findById(project.style).lean();
  if (!style) {
    return NextResponse.json({ error: "Style not found" }, { status: 404 });
  }

  let updated = false;

  for (let i = 0; i < project.clips.length; i++) {
    const clip = project.clips[i];
    const shot = style.shots[clip.shotIndex];
    if (!shot) continue;

    // Get a presigned URL for Fal to download the source image
    const sourceImage = project.sourceImages.find(
      (img) => img.url === clip.sourceImageUrl
    );
    const sourceKey = sourceImage?.key;

    // --- Image Transform Step ---
    if (shot.imagePrompt && clip.imageJob?.status === "pending") {
      // Start image transform job
      try {
        // Generate temp download URL for Fal (R2 public URLs don't work)
        const downloadUrl = sourceKey
          ? await createPresignedDownloadUrl(sourceKey)
          : clip.sourceImageUrl;

        const job = await submitImageTransform(
          downloadUrl,
          shot.imagePrompt,
          shot.imageModel || "fal-ai/nano-banana/edit"
        );
        clip.imageJob = {
          falRequestId: job.requestId,
          falModel: job.model,
          status: "processing",
          startedAt: new Date(),
        };
        updated = true;
      } catch (err) {
        console.error(`Clip ${i} image transform failed:`, err.message);
        clip.imageJob = { status: "failed", error: err.message };
        updated = true;
      }
    } else if (clip.imageJob?.status === "processing") {
      // Check image transform status
      try {
        const imageModelId = clip.imageJob.falModel || shot.imageModel || "fal-ai/nano-banana/edit";
        const status = await checkJob(
          imageModelId,
          clip.imageJob.falRequestId
        );

        if (status.status === "COMPLETED") {
          const result = await getJobResult(
            imageModelId,
            clip.imageJob.falRequestId
          );
          const data = result.data;
          const imageUrl =
            data?.images?.[0]?.url || data?.output?.url || data?.image?.url;

          if (imageUrl) {
            // Store transformed image in R2
            const r2Key = `projects/${project._id}/transformed-${i}.jpg`;
            const publicUrl = await downloadAndStoreToR2(
              imageUrl,
              r2Key,
              "image/jpeg"
            );
            clip.transformedImageUrl = publicUrl;
          }

          clip.imageJob.status = "completed";
          clip.imageJob.completedAt = new Date();
          updated = true;
        } else if (status.status === "FAILED") {
          clip.imageJob.status = "failed";
          clip.imageJob.error = "Fal job failed";
          updated = true;
        }
      } catch (err) {
        clip.imageJob.status = "failed";
        clip.imageJob.error = err.message;
        updated = true;
      }
    }

    // --- Video Generation Step ---
    // Start video gen when: no image transform needed and video pending, OR image transform completed
    const imageReady =
      !shot.imagePrompt || clip.imageJob?.status === "completed";
    // For video gen: use transformed image if available, else source
    // If both are R2 URLs, generate presigned download URL for Fal
    let videoSourceUrl = clip.transformedImageUrl || clip.sourceImageUrl;
    if (sourceKey && !clip.transformedImageUrl) {
      videoSourceUrl = await createPresignedDownloadUrl(sourceKey);
    }
    // Note: if transformedImageUrl exists, it was already stored in R2 with a key
    // We can generate a presigned URL for it too
    if (clip.transformedImageUrl) {
      const transformedKey = `projects/${project._id}/transformed-${i}.jpg`;
      try {
        videoSourceUrl = await createPresignedDownloadUrl(transformedKey);
      } catch {
        // Fall back to stored URL
      }
    }

    if (imageReady && clip.videoJob?.status === "pending") {
      try {
        const job = await submitVideoGeneration(
          videoSourceUrl,
          clip.customVideoPrompt || shot.videoPrompt,
          shot.videoModel || "fal-ai/kling-video/v3/pro",
          clip.customDuration || shot.duration || 5,
          style.aspectRatio || "16:9"
        );
        clip.videoJob = {
          falRequestId: job.requestId,
          falModel: job.model,
          status: "processing",
          startedAt: new Date(),
        };
        updated = true;
      } catch (err) {
        console.error(`Clip ${i} video gen failed:`, err.message);
        clip.videoJob = { status: "failed", error: err.message };
        updated = true;
      }
    } else if (clip.videoJob?.status === "processing") {
      try {
        const videoModelId = clip.videoJob.falModel || shot.videoModel || "fal-ai/kling-video/v3/pro/image-to-video";
        const status = await checkJob(
          videoModelId,
          clip.videoJob.falRequestId
        );

        if (status.status === "COMPLETED") {
          const result = await getJobResult(
            videoModelId,
            clip.videoJob.falRequestId
          );
          const data = result.data;
          const videoUrl = data?.video?.url || data?.output?.url;

          if (videoUrl) {
            const r2Key = `projects/${project._id}/clip-${i}.mp4`;
            const publicUrl = await downloadAndStoreToR2(
              videoUrl,
              r2Key,
              "video/mp4"
            );
            clip.videoUrl = publicUrl;
          }

          clip.videoJob.status = "completed";
          clip.videoJob.completedAt = new Date();
          updated = true;
        } else if (status.status === "FAILED") {
          clip.videoJob.status = "failed";
          clip.videoJob.error = "Fal job failed";
          updated = true;
        }
      } catch (err) {
        clip.videoJob.status = "failed";
        clip.videoJob.error = err.message;
        updated = true;
      }
    }
  }

  // Calculate progress
  const totalSteps = project.clips.length * 2; // image + video per clip
  let completedSteps = 0;
  let allDone = true;
  let anyFailed = false;

  for (const clip of project.clips) {
    const shot = style.shots[clip.shotIndex];
    if (!shot?.imagePrompt) {
      completedSteps++; // no image transform needed = already done
    } else if (clip.imageJob?.status === "completed") {
      completedSteps++;
    } else if (clip.imageJob?.status === "failed") {
      anyFailed = true;
    } else {
      allDone = false;
    }

    if (clip.videoJob?.status === "completed") {
      completedSteps++;
    } else if (clip.videoJob?.status === "failed") {
      anyFailed = true;
    } else {
      allDone = false;
    }
  }

  const progress = Math.round((completedSteps / totalSteps) * 100);
  let status = project.status;

  if (allDone && !anyFailed) {
    status = "completed";
  } else if (anyFailed && allDone) {
    status = "failed";
  } else {
    status = "generating";
  }

  if (updated || progress !== project.progress || status !== project.status) {
    project.progress = progress;
    project.status = status;
    await project.save();
  }

  return NextResponse.json(project.toJSON());
}
