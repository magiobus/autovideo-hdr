import fs from "fs/promises";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { connectDB, getModels, getR2Client, configureFal, fal } from "../helpers";

const execFileAsync = promisify(execFile);
const DEFAULT_AVATAR_TIMEOUT_MS = 600_000;
const AVATAR_FPS = 24;
const MAX_AVATAR_SECONDS = 24;
const DEFAULT_FAL_AVATAR_MODEL = "fal-ai/kling-video/v1/standard/ai-avatar";

export async function syncPresenterAvatarForProject(projectId: string) {
  await connectDB();
  const { Project } = await getModels();
  const project = await Project.findById(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);
  if (!project.editorState) throw new Error("Editor state not ready");

  const voiceover = findEditorItem(project.editorState, "voiceover");
  const presenter = findEditorItem(project.editorState, "presenter-bubble");
  const audioUrl = voiceover?.sourceUrl || project.editorState.artifacts?.voiceoverUrl;
  if (!audioUrl) throw new Error("Voiceover audio is required before generating avatar");
  if (!presenter) throw new Error("Presenter bubble is not enabled");

  project.editorState.avatar = {
    ...(project.editorState.avatar || {}),
    status: "generating",
    error: undefined,
    startedAt: new Date().toISOString(),
  };
  project.markModified("editorState");
  await project.save();

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "autovideo-avatar-"));
  try {
    const presenterVideoUrl = await withTimeout(
      generatePresenterAvatarVideo({
        projectId,
        tmpDir,
        audioUrl,
        presenterId: project.generationOptions?.presenter?.presenterId,
        duration: Number(voiceover?.duration || project.editorState.duration || 0),
      }),
      Number(process.env.AVATAR_GENERATION_TIMEOUT_MS || DEFAULT_AVATAR_TIMEOUT_MS),
      "Talking avatar generation timed out"
    );

    for (const track of project.editorState.tracks || []) {
      if (track.id !== "overlay") continue;
      track.items = (track.items || []).map((item: any) =>
        item.id === "presenter-bubble"
          ? {
              ...item,
              sourceUrl: presenterVideoUrl,
              start: Number(voiceover?.start || item.start || 0),
              duration: Number(voiceover?.duration || item.duration || 1),
              trimStart: Number(voiceover?.trimStart || 0),
            }
          : item
      );
    }

    project.editorState.artifacts = {
      ...(project.editorState.artifacts || {}),
      presenterVideoUrl,
    };
    project.editorState.avatar = {
      status: "rendered",
      presenterVideoUrl,
      renderedAt: new Date().toISOString(),
      error: undefined,
    };
    project.editorState.render = {
      ...(project.editorState.render || {}),
      status: "dirty",
      error: undefined,
    };
    project.markModified("editorState");
    await project.save();
    return { projectId, presenterVideoUrl };
  } catch (err: any) {
    project.editorState.avatar = {
      ...(project.editorState.avatar || {}),
      status: "failed",
      error: String(err.message || err).slice(0, 2000),
    };
    project.markModified("editorState");
    await project.save();
    throw err;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function generatePresenterAvatarVideo({
  projectId,
  tmpDir,
  audioUrl,
  presenterId,
  duration,
}: {
  projectId: string;
  tmpDir: string;
  audioUrl: string;
  presenterId?: string;
  duration: number;
}) {
  const safePresenterId = String(presenterId || "male-1").replace(/[^a-z0-9-]/gi, "");
  const presenterPath = path.join(
    process.cwd(),
    "public",
    "samples",
    "presenters",
    `${safePresenterId || "male-1"}.jpg`
  );

  await fs.access(presenterPath);
  if (process.env.AVATAR_PROVIDER === "local") {
    return generateLocalPresenterMotionVideo({
      projectId,
      tmpDir,
      presenterPath,
      duration,
    });
  }

  const presenterImageUrl = await uploadFileToR2({
    projectId,
    localPath: presenterPath,
    keyName: `presenter-${safePresenterId || "male-1"}.jpg`,
    contentType: "image/jpeg",
  });

  configureFal();
  const avatarDuration = Math.min(
    MAX_AVATAR_SECONDS,
    Math.max(2, Number(duration) || 6)
  );
  const model = process.env.AVATAR_FAL_MODEL || DEFAULT_FAL_AVATAR_MODEL;
  console.log(`[avatar] generating talking presenter with ${model}…`);
  let result: any;
  try {
    result = await fal.subscribe(model, {
      input: buildAvatarInput({
        model,
        presenterImageUrl,
        audioUrl,
        avatarDuration,
      }),
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === "IN_PROGRESS") {
          update.logs?.map((log: any) => log.message).forEach((message: string) => {
            console.log(`[avatar] ${message}`);
          });
        }
      },
    });
  } catch (err: any) {
    console.log(`[avatar] fal failed, using local motion fallback: ${err.message}`);
    return generateLocalPresenterMotionVideo({
      projectId,
      tmpDir,
      presenterPath,
      duration,
    });
  }

  const videoUrl = (result.data as any)?.video?.url;
  if (!videoUrl) {
    console.log("[avatar] fal returned no video URL, using local motion fallback");
    return generateLocalPresenterMotionVideo({
      projectId,
      tmpDir,
      presenterPath,
      duration,
    });
  }

  const avatarPath = path.join(tmpDir, "presenter-avatar.mp4");
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) {
    console.log(`[avatar] fal video download failed (${videoRes.status}), using local motion fallback`);
    return generateLocalPresenterMotionVideo({
      projectId,
      tmpDir,
      presenterPath,
      duration,
    });
  }
  await fs.writeFile(avatarPath, Buffer.from(await videoRes.arrayBuffer()));

  return uploadFileToR2({
    projectId,
    localPath: avatarPath,
    keyName: "presenter-avatar.mp4",
    contentType: "video/mp4",
  });
}

async function generateLocalPresenterMotionVideo({
  projectId,
  tmpDir,
  presenterPath,
  duration,
}: {
  projectId: string;
  tmpDir: string;
  presenterPath: string;
  duration: number;
}) {
  const avatarDuration = Math.min(
    MAX_AVATAR_SECONDS,
    Math.max(2, Number(duration) || 6)
  );
  const outputPath = path.join(tmpDir, "presenter-avatar-local.mp4");
  const frames = Math.ceil(avatarDuration * AVATAR_FPS);
  console.log(`[avatar] generating local presenter motion fallback (${avatarDuration}s)…`);

  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-loop",
      "1",
      "-i",
      presenterPath,
      "-t",
      String(avatarDuration),
      "-vf",
      [
        "scale=640:640:force_original_aspect_ratio=increase",
        "crop=640:640",
        `zoompan=z='1.04+0.025*sin(on/5)':x='iw/2-(iw/zoom/2)+10*sin(on/9)':y='ih/2-(ih/zoom/2)+8*sin(on/7)':d=${frames}:s=640x640:fps=${AVATAR_FPS}`,
        "drawbox=x='260+8*sin(t*16)':y='405+4*sin(t*11)':w='120+18*abs(sin(t*18))':h='18+8*abs(sin(t*13))':color=black@0.34:t=fill",
        "drawbox=x='270+8*sin(t*16)':y='410+4*sin(t*11)':w='100+18*abs(sin(t*18))':h='8+6*abs(sin(t*13))':color=white@0.16:t=fill",
        "format=yuv420p",
      ].join(","),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "22",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    { maxBuffer: 1024 * 1024 * 20 }
  );

  return uploadFileToR2({
    projectId,
    localPath: outputPath,
    keyName: "presenter-avatar.mp4",
    contentType: "video/mp4",
  });
}

async function uploadFileToR2({
  projectId,
  localPath,
  keyName,
  contentType,
}: {
  projectId: string;
  localPath: string;
  keyName: string;
  contentType: string;
}) {
  const body = await fs.readFile(localPath);
  const key = `projects/${projectId}/${keyName}`;
  const r2 = getR2Client();
  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${key}`;
}

function buildAvatarInput({
  model,
  presenterImageUrl,
  audioUrl,
  avatarDuration,
}: {
  model: string;
  presenterImageUrl: string;
  audioUrl: string;
  avatarDuration: number;
}) {
  const prompt =
    "Professional presenter speaking naturally to camera. Natural blinking, realistic lip sync, subtle head movement, calm friendly expression, polished but not theatrical.";

  if (model === "fal-ai/infinitalk") {
    return {
      image_url: presenterImageUrl,
      audio_url: audioUrl,
      prompt,
      num_frames: Math.min(
        721,
        Math.max(41, Math.ceil(avatarDuration * AVATAR_FPS))
      ),
      resolution: "480p",
      acceleration: resolveAvatarAcceleration(),
    };
  }

  if (model === "fal-ai/hunyuan-avatar") {
    return {
      image_url: presenterImageUrl,
      audio_url: audioUrl,
    };
  }

  return {
    image_url: presenterImageUrl,
    audio_url: audioUrl,
    prompt,
  };
}

function findEditorItem(editorState: any, itemId: string) {
  return (editorState.tracks || [])
    .flatMap((track: any) => track.items || [])
    .find((item: any) => item.id === itemId);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function resolveAvatarAcceleration(): "none" | "regular" | "high" {
  const value = process.env.AVATAR_ACCELERATION;
  if (value === "none" || value === "regular" || value === "high") return value;
  return "regular";
}
