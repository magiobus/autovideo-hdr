import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { connectDB, getModels, getOpenAI, getR2Client, configureFal, fal } from "../helpers";
import { createEditorState } from "@/libs/editor/create-editor-state";

const execFileAsync = promisify(execFile);
const VIDEO_WIDTH = 1920;
const VIDEO_HEIGHT = 1080;
const FPS = 30;
const TRANSITION_SECONDS = 0.45;
const MIN_TRANSITION_CLIP_SECONDS = TRANSITION_SECONDS + 0.1;

type EditPlan = {
  voiceover: string;
  supportText: Array<{
    clipIndex: number;
    headline: string;
    kicker?: string;
    position?: "bottom-left" | "bottom-center" | "top-left";
  }>;
};

export async function assemble(projectId: string): Promise<string> {
  await connectDB();
  const { Project, Style } = await getModels();

  const project = await Project.findById(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  if (project.status === "completed" && project.finalVideoUrl) {
    console.log(`[assemble] already completed, skipping`);
    return projectId;
  }

  const style = await Style.findById(project.style).lean();
  const styleData = style as any;
  const generationOptions = project.generationOptions || {};

  project.status = "assembling";
  project.progress = 88;
  await project.save();

  const completedClips = project.clips
    .filter((c: any) => c.videoJob?.status === "completed" && c.videoUrl)
    .sort((a: any, b: any) => a.order - b.order);

  if (completedClips.length === 0) {
    project.status = "failed";
    await project.save();
    throw new Error("No completed clips to assemble");
  }
  if (completedClips.length !== project.clips.length) {
    project.status = "failed";
    await project.save();
    throw new Error(`Only ${completedClips.length}/${project.clips.length} clips completed`);
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "autovideo-"));
  console.log(`[assemble] tmpDir: ${tmpDir}, clips: ${completedClips.length}`);

  try {
    // ── 1. Download clips ──
    console.log(`[assemble] downloading clips…`);
    const clipPaths: string[] = [];
    for (let i = 0; i < completedClips.length; i++) {
      const clipPath = path.join(tmpDir, `clip-${i}.mp4`);
      const res = await fetch(completedClips[i].videoUrl);
      if (!res.ok) throw new Error(`Failed to download clip ${i}: ${res.status}`);
      await fs.writeFile(clipPath, Buffer.from(await res.arrayBuffer()));
      clipPaths.push(clipPath);
    }

    // ── 2. Normalize clips ──
    console.log(`[assemble] normalizing…`);
    const normalizedPaths: string[] = [];
    const shots = styleData?.shots || [];
    const plannedDurations = completedClips.map((clip: any) => {
      const shot = shots[clip.shotIndex];
      return Number(shot?.duration || 5);
    });

    for (let i = 0; i < clipPaths.length; i++) {
      const normalized = path.join(tmpDir, `normalized-${i}.mp4`);
      await ffmpeg([
        "-y",
        "-i",
        clipPaths[i],
        "-t",
        String(plannedDurations[i]),
        "-vf",
        `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},setsar=1,eq=contrast=1.035:saturation=1.04`,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-r",
        String(FPS),
        "-pix_fmt",
        "yuv420p",
        "-an",
        normalized,
      ]);
      normalizedPaths.push(normalized);
    }

    const clipDurations = await Promise.all(
      normalizedPaths.map(async (normalizedPath, i) => {
        const duration = await probeDuration(normalizedPath);
        if (!Number.isFinite(duration) || duration <= 0) {
          console.log(
            `[assemble] ffprobe duration unavailable for clip ${i}, using planned ${plannedDurations[i]}s`
          );
          return plannedDurations[i];
        }
        return Math.min(plannedDurations[i], duration);
      })
    );
    const tooShortClipIndex = clipDurations.findIndex(
      (duration) => duration < MIN_TRANSITION_CLIP_SECONDS
    );
    if (tooShortClipIndex !== -1) {
      throw new Error(
        `Clip ${tooShortClipIndex} is too short for assembly (${clipDurations[
          tooShortClipIndex
        ].toFixed(2)}s)`
      );
    }

    const totalDuration = clipDurations.reduce((sum, duration) => sum + duration, 0);

    // ── 3. Editorial copy plan ──
    const supportTextEnabled = isGenerationOptionEnabled(
      generationOptions.supportText,
      true
    );
    const editPlan = await createEditPlan({
      project,
      completedClips,
      shots,
      totalDuration,
    });
    if (!supportTextEnabled) editPlan.supportText = [];
    await fs.writeFile(
      path.join(tmpDir, "edit-plan.json"),
      JSON.stringify(editPlan, null, 2),
      "utf8"
    );

    const renderedDuration = effectiveDuration(clipDurations);

    // ── 4. Voiceover ──
    let voiceoverPath: string | null = null;
    let voiceoverUrl: string | null = null;
    const voiceoverEnabled =
      isGenerationOptionEnabled(generationOptions.voiceover, true) &&
      styleData?.voiceover?.enabled !== false;

    if (voiceoverEnabled) {
      console.log(`[assemble] generating voiceover…`);
      const script = tightenVoiceover(editPlan.voiceover);
      console.log(`[assemble] voiceover script: "${script.substring(0, 120)}…"`);

      // ── Gemini TTS via Fal ──
      configureFal();
      const ttsResult = await fal.subscribe("fal-ai/gemini-tts", {
        input: {
          prompt: script,
          model: "gemini-2.5-flash-tts",
          style_instructions: buildVoiceStyleInstructions(generationOptions.voiceover),
          voice: getGeminiVoicePreset(generationOptions.voiceover),
          language_code: "English (US)",
          output_format: "mp3",
        },
      });

      const ttsData = ttsResult.data as any;
      const audioUrl = ttsData?.audio?.url;

      if (!audioUrl) {
        console.log(`[assemble] TTS returned no audio URL, skipping voiceover`);
      } else {
        voiceoverPath = path.join(tmpDir, "voiceover.mp3");
        const audioRes = await fetch(audioUrl);
        if (!audioRes.ok) {
          console.log(`[assemble] TTS audio download failed: ${audioRes.status}`);
          voiceoverPath = null;
        } else {
          await fs.writeFile(voiceoverPath, Buffer.from(await audioRes.arrayBuffer()));
          console.log(`[assemble] TTS done (Gemini 2.5 Flash TTS)`);
        }
      }
    }

    if (voiceoverPath) {
      voiceoverUrl = await uploadFileToR2({
        projectId,
        localPath: voiceoverPath,
        keyName: "voiceover.mp3",
        contentType: "audio/mpeg",
      });
    }

    // ── 5. Music asset ──
    let musicPath: string | null = null;
    let musicAssetUrl: string | null = null;

    const musicEnabled = isGenerationOptionEnabled(generationOptions.music, true);
    const musicUrl = styleData?.musicUrl || process.env.DEFAULT_MUSIC_URL;
    if (!musicEnabled) {
      console.log(`[assemble] music disabled by generation options`);
    } else if (musicUrl) {
      try {
        const musicRes = await fetch(musicUrl);
        if (musicRes.ok) {
          musicPath = path.join(tmpDir, "music.mp3");
          await fs.writeFile(musicPath, Buffer.from(await musicRes.arrayBuffer()));
          musicAssetUrl = musicUrl;
          console.log(`[assemble] music downloaded`);
        } else {
          console.log(`[assemble] music download failed: ${musicRes.status}`);
        }
      } catch {
        console.log(`[assemble] music download failed, skipping`);
      }
    } else {
      console.log(`[assemble] no musicUrl configured, generating AI music bed`);
      musicPath = await generateMusicWithFal({
        tmpDir,
        duration: renderedDuration,
        project,
        editPlan,
        musicOptions: generationOptions.music,
      });
    }

    if (musicPath && !musicAssetUrl) {
      musicAssetUrl = await uploadFileToR2({
        projectId,
        localPath: musicPath,
        keyName: path.extname(musicPath) === ".wav" ? "music.wav" : "music.mp3",
        contentType: path.extname(musicPath) === ".wav" ? "audio/wav" : "audio/mpeg",
      });
    }

    // ── 6. Persist editable timeline ──
    console.log(`[assemble] creating editable timeline`);
    const editPlanKey = `projects/${projectId}/edit-plan.json`;
    const r2 = getR2Client();
    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: editPlanKey,
        Body: JSON.stringify(editPlan, null, 2),
        ContentType: "application/json",
      })
    );

    const publicBaseUrl = process.env.R2_PUBLIC_URL!.replace(/\/$/, "");
    const editorState = createEditorState({
      clips: completedClips.map((clip: any) => ({
        videoUrl: clip.videoUrl,
        shotIndex: clip.shotIndex,
      })),
      clipDurations,
      editPlan,
      voiceoverUrl,
      musicUrl: musicAssetUrl,
      generationOptions,
      appBaseUrl: getAppBaseUrl(),
    });

    project.editorState = {
      ...editorState,
      artifacts: {
        ...(editorState.artifacts || {}),
        editPlanUrl: `${publicBaseUrl}/${editPlanKey}`,
      },
    };
    project.status = "editing";
    project.progress = 92;
    await project.save();

    console.log(`[assemble] editable timeline ready (${renderedDuration.toFixed(2)}s)`);
    await fs.rm(tmpDir, { recursive: true, force: true });

    return projectId;
  } catch (err: any) {
    console.log(`[assemble] FAILED: ${err.message}`);
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    project.editorState = {
      ...(project.editorState || {}),
      assemblyError: String(err.message || err).slice(0, 2000),
    };
    project.markModified("editorState");
    project.status = "failed";
    await project.save();
    throw err;
  }
}

async function ffmpeg(args: string[]) {
  await execFileAsync("ffmpeg", args, { maxBuffer: 1024 * 1024 * 20 });
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

function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    ""
  );
}

async function probeDuration(filePath: string) {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { maxBuffer: 1024 * 1024 }
    );
    return Number.parseFloat(stdout.trim());
  } catch (err: any) {
    console.log(`[assemble] ffprobe failed for ${path.basename(filePath)}: ${err.message}`);
    return Number.NaN;
  }
}

function escapeFilterValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
}

function isGenerationOptionEnabled(option: any, fallback: boolean) {
  if (typeof option === "boolean") return option;
  if (option && typeof option.enabled === "boolean") return option.enabled;
  return fallback;
}

function buildVoiceStyleInstructions(voiceOptions: any) {
  const gender = voiceOptions?.gender === "female" ? "female" : "male";
  const preset = String(voiceOptions?.voicePresetId || "");
  const tone = preset.includes("editorial")
    ? "editorial, composed, and refined"
    : "warm, cinematic, and architectural";

  return [
    `Use a premium ${gender} narrator voice.`,
    `The delivery should be ${tone}.`,
    "Speak like a premium architectural film narrator.",
    "Warm, intimate, understated, and slow.",
    "Leave clean pauses between sentence fragments.",
    "No realtor energy, no YouTube host energy, no corporate explainer tone.",
    "The voice should feel expensive, quiet, and human.",
  ].join(" ");
}

function getGeminiVoicePreset(voiceOptions: any) {
  const preset = String(voiceOptions?.voicePresetId || "");
  if (preset === "male-editorial") return "Fenrir";
  if (preset === "female-architect") return "Aoede";
  if (preset === "female-editorial") return "Zephyr";
  return "Charon";
}

async function generateMusicWithFal({
  tmpDir,
  duration,
  project,
  editPlan,
  musicOptions,
}: {
  tmpDir: string;
  duration: number;
  project: any;
  editPlan: EditPlan;
  musicOptions?: any;
}) {
  if (process.env.GENERATE_AI_MUSIC === "false") {
    console.log(`[assemble] AI music disabled by GENERATE_AI_MUSIC=false`);
    return null;
  }

  try {
    configureFal();
    const musicDuration = Math.min(180, Math.max(30, Math.ceil(duration + 4)));
    const prompt = buildMusicPrompt(project, editPlan, musicOptions);

    const result = await fal.subscribe("cassetteai/music-generator", {
      input: {
        prompt,
        duration: musicDuration,
      },
    });

    const audioUrl = extractFalAudioUrl(result.data);
    if (!audioUrl) {
      console.log(`[assemble] AI music returned no audio URL`);
      return null;
    }

    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      console.log(`[assemble] AI music download failed: ${audioRes.status}`);
      return null;
    }

    const musicPath = path.join(tmpDir, "ai-music.wav");
    await fs.writeFile(musicPath, Buffer.from(await audioRes.arrayBuffer()));
    console.log(`[assemble] AI music generated (${musicDuration}s)`);
    return musicPath;
  } catch (err: any) {
    console.log(`[assemble] AI music generation failed, skipping: ${err.message}`);
    return null;
  }
}

function buildMusicPrompt(project: any, editPlan: EditPlan, musicOptions?: any) {
  const location = project.propertyInfo?.address
    ? ` Inspired by a premium architectural film for ${project.propertyInfo.address}.`
    : "";
  const narrationMood = editPlan.voiceover ? ` Mood: ${editPlan.voiceover}` : "";
  const musicPresets: Record<string, string> = {
    "minimal-house":
      "minimal ambient house, soft pulse, premium architectural film, no vocals",
    "cinematic-piano":
      "soft cinematic piano, warm pads, restrained low pulse, emotional but understated, no vocals",
    "editorial-luxury":
      "editorial luxury music bed, elegant synth pads, subtle percussion, polished, expensive, no vocals",
  };
  const selectedPrompt =
    musicOptions?.mode === "custom" && musicOptions?.customPrompt
      ? String(musicOptions.customPrompt)
      : musicPresets[String(musicOptions?.presetId || "")] || "";

  return [
    "Instrumental cinematic background music for a luxury real estate architectural video.",
    "No vocals, no lyrics, no spoken words.",
    "Warm minimal ambient house, elegant synth pads, subtle piano, soft bass pulse, restrained percussion.",
    "Premium, understated, polished, emotional, expensive, spacious.",
    "Designed to sit under a quiet narrator without competing with the voice.",
    "Tempo around 88 BPM, smooth intro, no abrupt drops, no cheesy corporate sound.",
    selectedPrompt,
    location,
    narrationMood,
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFalAudioUrl(data: any) {
  return (
    data?.audio_file?.url ||
    data?.audio?.url ||
    data?.file?.url ||
    data?.output?.url ||
    data?.music?.url ||
    data?.url ||
    null
  );
}

async function createEditPlan({
  project,
  completedClips,
  shots,
  totalDuration,
}: {
  project: any;
  completedClips: any[];
  shots: any[];
  totalDuration: number;
}): Promise<EditPlan> {
  const fallback = buildFallbackEditPlan(project, completedClips, shots);

  try {
    const openai = getOpenAI();
    const maxWords = Math.max(18, Math.floor(totalDuration * 0.75));
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are the creative director for a top-tier real estate video edit. Write sparse, cinematic copy in the style of premium architectural reels from elite real estate videographers. No realtor-on-camera ideas. No brochure language. No "welcome to". No long sentences.

Return JSON only:
{
  "voiceover": "short poetic narration, max ${maxWords} words",
  "supportText": [
    { "clipIndex": 0, "headline": "A quieter kind of luxury", "kicker": "Park City", "position": "bottom-left" }
  ]
}

Rules:
- Voiceover should feel optional and restrained; silence should carry the edit.
- Voiceover should be 18-36 words total unless the owner notes demand one concrete detail.
- Use fragments, not full sales sentences.
- Support text should be 2 to 5 words, editorial, not descriptive labels like "Kitchen".
- Use real details only from owner notes, detected photo features, address, price, and shot names.
- Add support text to 4-6 clips max: opening, living/kitchen, detail, outdoor, closing.
- Avoid hype words like stunning, beautiful, amazing, dream home.`,
        },
        {
          role: "user",
          content: `Property info:
Address: ${project.propertyInfo?.address || "(not provided)"}
Price: ${project.propertyInfo?.price || "(not provided)"}
Description: ${project.propertyInfo?.description || "(not provided)"}
Owner notes: ${project.propertyInfo?.narrationNotes || "(none)"}

Detected visual features:
${(project.sourceImages || []).filter((img: any) => img.features).map((img: any) => `- ${img.features}`).join("\n") || "(none)"}

Timeline clips:
${completedClips.map((clip, i) => {
  const shot = shots[clip.shotIndex];
  return `${i}: ${shot?.name || "Shot"} (${shot?.roomType || "unknown"})`;
}).join("\n")}

Total duration: ${Math.round(totalDuration)} seconds.`,
        },
      ],
      max_tokens: 900,
    });

    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    return normalizeEditPlan(parsed, fallback, completedClips.length);
  } catch (err: any) {
    console.log(`[assemble] edit plan failed, using fallback: ${err.message}`);
    return fallback;
  }
}

function normalizeEditPlan(input: any, fallback: EditPlan, clipCount: number): EditPlan {
  const voiceover =
    typeof input?.voiceover === "string" && input.voiceover.trim()
      ? tightenVoiceover(input.voiceover)
      : fallback.voiceover;
  const seen = new Set<number>();
  const supportText = Array.isArray(input?.supportText)
    ? input.supportText
        .map((item: any) => ({
          clipIndex: Number(item.clipIndex),
          headline: String(item.headline || "").trim(),
          kicker: item.kicker ? String(item.kicker).trim() : "",
          position: ["bottom-left", "bottom-center", "top-left"].includes(item.position)
            ? item.position
            : "bottom-left",
        }))
        .filter((item: any) => {
          if (
            !Number.isInteger(item.clipIndex) ||
            item.clipIndex < 0 ||
            item.clipIndex >= clipCount ||
            !item.headline ||
            seen.has(item.clipIndex)
          ) {
            return false;
          }
          seen.add(item.clipIndex);
          return true;
        })
        .slice(0, 6)
    : [];

  return {
    voiceover,
    supportText: supportText.length > 0 ? supportText : fallback.supportText,
  };
}

function tightenVoiceover(script: string) {
  return script
    .replace(/\s+/g, " ")
    .replace(/^["']|["']$/g, "")
    .trim()
    .split(" ")
    .slice(0, 42)
    .join(" ");
}

function buildFallbackEditPlan(project: any, completedClips: any[], shots: any[]): EditPlan {
  const address = project.propertyInfo?.address || "";
  const price = project.propertyInfo?.price || "";
  const supportText = completedClips
    .map((clip, i) => {
      const shot = shots[clip.shotIndex];
      const name = shot?.name || "";
      if (i === 0) {
        return {
          clipIndex: i,
          headline: address ? "A quieter kind of luxury" : "Designed to be felt",
          kicker: address,
          position: "bottom-left" as const,
        };
      }
      if (/kitchen/i.test(name)) {
        return { clipIndex: i, headline: "Stone. Light. Precision.", position: "bottom-left" as const };
      }
      if (/detail|bath/i.test(name)) {
        return { clipIndex: i, headline: "Details that hold", position: "bottom-left" as const };
      }
      if (/outdoor|pool|patio/i.test(name)) {
        return { clipIndex: i, headline: "Built around the view", position: "bottom-left" as const };
      }
      if (i === completedClips.length - 1) {
        return {
          clipIndex: i,
          headline: price || "Private showings available",
          position: "bottom-left" as const,
        };
      }
      return null;
    })
    .filter(Boolean) as EditPlan["supportText"];

  return {
    voiceover:
      "Not every home asks for attention. Some just hold it. Light, texture, and quiet intention. A slower kind of luxury.",
    supportText,
  };
}

async function renderEditedTimeline({
  tmpDir,
  inputPaths,
  durations,
  editPlan,
  outputPath,
}: {
  tmpDir: string;
  inputPaths: string[];
  durations: number[];
  editPlan: EditPlan;
  outputPath: string;
}) {
  const timelinePath = path.join(tmpDir, "timeline.mp4");
  if (inputPaths.length === 1) {
    await ffmpeg(["-y", "-i", inputPaths[0], "-c", "copy", timelinePath]);
  } else {
    const args = ["-y"];
    for (const inputPath of inputPaths) {
      args.push("-i", inputPath);
    }

    const filterParts: string[] = [];
    let previous = "0:v";
    let elapsed = durations[0];
    for (let i = 1; i < inputPaths.length; i++) {
      const out = i === inputPaths.length - 1 ? "vout" : `vx${i}`;
      const offset = Math.max(0.1, elapsed - TRANSITION_SECONDS * i);
      filterParts.push(
        `[${previous}][${i}:v]xfade=transition=fade:duration=${TRANSITION_SECONDS}:offset=${offset.toFixed(2)}[${out}]`
      );
      previous = out;
      elapsed += durations[i];
    }

    args.push(
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "[vout]",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "21",
      "-r",
      String(FPS),
      "-pix_fmt",
      "yuv420p",
      timelinePath
    );
    await ffmpeg(args);
  }

  await addSupportText({
    tmpDir,
    inputPath: timelinePath,
    durations,
    supportText: editPlan.supportText,
    outputPath,
  });
}

async function addSupportText({
  tmpDir,
  inputPath,
  durations,
  supportText,
  outputPath,
}: {
  tmpDir: string;
  inputPath: string;
  durations: number[];
  supportText: EditPlan["supportText"];
  outputPath: string;
}) {
  const filters: string[] = [
    "fade=t=in:st=0:d=0.35",
    `fade=t=out:st=${Math.max(0, effectiveDuration(durations) - 0.45).toFixed(2)}:d=0.45`,
  ];
  const starts = getClipStarts(durations);

  for (const item of supportText) {
    const start = starts[item.clipIndex] + 0.45;
    const duration = Math.min(3.1, Math.max(1.8, durations[item.clipIndex] - 1.0));
    const end = start + duration;
    const textFile = path.join(tmpDir, `support-${item.clipIndex}.txt`);
    const kickerFile = path.join(tmpDir, `support-${item.clipIndex}-kicker.txt`);
    await fs.writeFile(textFile, item.headline, "utf8");
    if (item.kicker) await fs.writeFile(kickerFile, item.kicker, "utf8");

    const { x, y, align } = textPosition(item.position || "bottom-left");
    filters.push(
      `drawtext=textfile=${escapeFilterValue(textFile)}:fontsize=58:fontcolor=white:x=${x}:y=${y}:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})':alpha='${fadeExpression(start, end)}'`
    );

    if (item.kicker) {
      filters.push(
        `drawtext=textfile=${escapeFilterValue(kickerFile)}:fontsize=24:fontcolor=white@0.72:x=${x}:y=${align === "bottom" ? "h-112" : "112"}:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})':alpha='${fadeExpression(start, end)}'`
      );
    }
  }

  await ffmpeg([
    "-y",
    "-i",
    inputPath,
    "-vf",
    filters.join(","),
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);
}

function getClipStarts(durations: number[]) {
  const starts: number[] = [];
  let elapsed = 0;
  for (let i = 0; i < durations.length; i++) {
    starts.push(Math.max(0, elapsed - TRANSITION_SECONDS * i));
    elapsed += durations[i];
  }
  return starts;
}

function effectiveDuration(durations: number[]) {
  return durations.reduce((sum, duration) => sum + duration, 0) - TRANSITION_SECONDS * Math.max(0, durations.length - 1);
}

function fadeExpression(start: number, end: number) {
  const fadeInEnd = start + 0.35;
  const fadeOutStart = end - 0.35;
  return `if(lt(t,${fadeInEnd.toFixed(2)}),(t-${start.toFixed(2)})/0.35,if(gt(t,${fadeOutStart.toFixed(2)}),(${end.toFixed(2)}-t)/0.35,1))`;
}

function textPosition(position: string) {
  if (position === "bottom-center") return { x: "(w-tw)/2", y: "h-150", align: "bottom" };
  if (position === "top-left") return { x: "86", y: "86", align: "top" };
  return { x: "86", y: "h-150", align: "bottom" };
}

function buildHyperframesComposition({
  clips,
}: {
  clips: Array<{
    path: string;
    duration: number;
    text?: EditPlan["supportText"][number];
  }>;
}) {
  let start = 0;
  const body = clips
    .map((clip, i) => {
      const videoStart = start;
      start += clip.duration - (i < clips.length - 1 ? TRANSITION_SECONDS : 0);
      const overlay = clip.text
        ? `<div class="support ${clip.text.position || "bottom-left"}" data-start="${(videoStart + 0.45).toFixed(2)}" data-duration="${Math.min(3.1, clip.duration - 1).toFixed(2)}" data-track-index="${i + 10}">
  ${clip.text.kicker ? `<span>${escapeHtml(clip.text.kicker)}</span>` : ""}
  <h1>${escapeHtml(clip.text.headline)}</h1>
</div>`
        : "";
      return `<video data-start="${videoStart.toFixed(2)}" data-duration="${clip.duration}" data-track-index="${i}" src="${escapeHtml(clip.path)}" muted playsinline></video>
${overlay}`;
    })
    .join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; background: #000; font-family: Helvetica, Arial, sans-serif; }
    [data-composition-id] { position: relative; overflow: hidden; background: #000; color: white; }
    video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .support { position: absolute; z-index: 10; color: white; letter-spacing: 0; }
    .support h1 { margin: 0; font-size: 58px; font-weight: 500; line-height: 1; }
    .support span { display: block; margin-bottom: 14px; font-size: 24px; color: rgba(255,255,255,.72); }
    .bottom-left { left: 86px; bottom: 86px; }
    .bottom-center { left: 50%; bottom: 86px; transform: translateX(-50%); text-align: center; }
    .top-left { left: 86px; top: 86px; }
  </style>
</head>
<body>
<div data-composition-id="autohdr-video-studio" data-start="0" data-width="${VIDEO_WIDTH}" data-height="${VIDEO_HEIGHT}">
${body}
</div>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
