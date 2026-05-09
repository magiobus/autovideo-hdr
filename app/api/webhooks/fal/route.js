import { NextResponse } from "next/server";
import connectDB from "@/libs/mongoose";
import Project from "@/models/Project";
import Style from "@/models/Style";
import { downloadAndStoreToR2 } from "@/helpers/downloadAndStoreToR2";
import { submitVideoGeneration } from "@/libs/fal";
import { createPresignedDownloadUrl } from "@/libs/r2";

function getWebhookUrl() {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";
  return `${base}/api/webhooks/fal`;
}

export async function POST(request) {
  await connectDB();

  const body = await request.json();
  const { request_id, status, payload, error } = body;

  console.log(`[webhook] received: request_id=${request_id} status=${status}`);

  if (!request_id) {
    return NextResponse.json({ error: "Missing request_id" }, { status: 400 });
  }

  // Find the project + clip that has this falRequestId
  const project = await Project.findOne({
    $or: [
      { "clips.imageJob.falRequestId": request_id },
      { "clips.videoJob.falRequestId": request_id },
    ],
  });

  if (!project) {
    console.log(`[webhook] no project found for request_id=${request_id}`);
    return NextResponse.json({ ok: true });
  }

  const style = await Style.findById(project.style).lean();

  for (let i = 0; i < project.clips.length; i++) {
    const clip = project.clips[i];
    const shot = style?.shots?.[clip.shotIndex];

    // --- Image transform completed ---
    if (clip.imageJob?.falRequestId === request_id) {
      if (status === "OK" && payload) {
        try {
          const imageUrl =
            payload?.images?.[0]?.url ||
            payload?.output?.url ||
            payload?.image?.url;

          if (imageUrl) {
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
          console.log(`[webhook] clip ${i} image transform completed`);

          // Chain: now submit video generation
          if (shot && clip.videoJob?.status === "pending") {
            try {
              const sourceImage = project.sourceImages.find(
                (img) => img.url === clip.sourceImageUrl
              );
              let videoSourceUrl = clip.transformedImageUrl;

              // If no transformed image, use presigned URL of original
              if (!videoSourceUrl && sourceImage?.key) {
                videoSourceUrl = await createPresignedDownloadUrl(
                  sourceImage.key
                );
              }

              if (videoSourceUrl) {
                const job = await submitVideoGeneration(
                  videoSourceUrl,
                  clip.customVideoPrompt || shot.videoPrompt,
                  shot.videoModel || "fal-ai/kling-video/v3/pro",
                  clip.customDuration || shot.duration || 5,
                  style.aspectRatio || "16:9",
                  getWebhookUrl()
                );
                clip.videoJob = {
                  falRequestId: job.requestId,
                  falModel: job.model,
                  status: "processing",
                  startedAt: new Date(),
                };
                console.log(`[webhook] clip ${i} video gen submitted`);
              }
            } catch (err) {
              console.error(`[webhook] clip ${i} video submit failed:`, err.message);
              clip.videoJob = { status: "failed", error: err.message };
            }
          }
        } catch (err) {
          console.error(`[webhook] clip ${i} image save failed:`, err.message);
          clip.imageJob.status = "failed";
          clip.imageJob.error = err.message;
        }
      } else {
        clip.imageJob.status = "failed";
        clip.imageJob.error = error || "Fal job failed";
        console.log(`[webhook] clip ${i} image transform failed:`, error);
      }
      break;
    }

    // --- Video generation completed ---
    if (clip.videoJob?.falRequestId === request_id) {
      if (status === "OK" && payload) {
        try {
          const videoUrl =
            payload?.video?.url || payload?.output?.url || payload?.output;

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
          console.log(`[webhook] clip ${i} video gen completed`);
        } catch (err) {
          console.error(`[webhook] clip ${i} video save failed:`, err.message);
          clip.videoJob.status = "failed";
          clip.videoJob.error = err.message;
        }
      } else {
        clip.videoJob.status = "failed";
        clip.videoJob.error = error || "Fal job failed";
        console.log(`[webhook] clip ${i} video gen failed:`, error);
      }
      break;
    }
  }

  // Calculate progress
  const totalSteps = project.clips.length * 2;
  let completedSteps = 0;
  let allDone = true;

  for (const clip of project.clips) {
    const shot = style?.shots?.[clip.shotIndex];
    if (!shot?.imagePrompt) {
      completedSteps++;
    } else if (clip.imageJob?.status === "completed") {
      completedSteps++;
    } else if (clip.imageJob?.status !== "failed") {
      allDone = false;
    }

    if (clip.videoJob?.status === "completed") {
      completedSteps++;
    } else if (clip.videoJob?.status !== "failed") {
      allDone = false;
    }
  }

  project.progress = Math.round((completedSteps / totalSteps) * 100);

  // Check if all clips are done → trigger assembly
  if (allDone) {
    const anySuccess = project.clips.some(
      (c) => c.videoJob?.status === "completed"
    );
    if (anySuccess) {
      project.status = "assembling";
      console.log(`[webhook] all clips done, triggering assembly`);

      // Fire and forget assembly
      const baseUrl = getWebhookUrl().replace("/api/webhooks/fal", "");
      fetch(`${baseUrl}/api/projects/${project._id}/assemble`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch((err) =>
        console.error("[webhook] assembly trigger failed:", err.message)
      );
    } else {
      project.status = "failed";
    }
  } else {
    project.status = "generating";
  }

  await project.save();

  return NextResponse.json({ ok: true });
}
