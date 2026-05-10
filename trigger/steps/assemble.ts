import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { connectDB, getModels, getOpenAI, getR2Client, configureFal, fal } from "../helpers";
import { createEditorState } from "@/libs/editor/create-editor-state";
import { generatePresenterAvatarVideo } from "./presenter-avatar";

const execFileAsync = promisify(execFile);
const LANDSCAPE_WIDTH = 1920;
const LANDSCAPE_HEIGHT = 1080;
const FPS = 30;
const TRANSITION_SECONDS = 0.45;
const MIN_TRANSITION_CLIP_SECONDS = TRANSITION_SECONDS + 0.1;
const AVATAR_GENERATION_TIMEOUT_MS = Number(
  process.env.AVATAR_GENERATION_TIMEOUT_MS || 600_000
);

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
  const renderDimensions = resolveRenderDimensions(generationOptions);

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
        `scale=${renderDimensions.width}:${renderDimensions.height}:force_original_aspect_ratio=increase,crop=${renderDimensions.width}:${renderDimensions.height},setsar=1,eq=contrast=1.035:saturation=1.04`,
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
      const script = cleanVoiceover(
        editPlan.voiceover,
        voiceoverWordLimit(project, renderedDuration)
      );
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

    let presenterVideoUrl: string | null = null;
    if (voiceoverUrl && generationOptions?.presenter?.enabled) {
      try {
        presenterVideoUrl = await withTimeout(
          generatePresenterAvatarVideo({
            projectId,
            tmpDir,
            audioUrl: voiceoverUrl,
            presenterId: generationOptions.presenter.presenterId,
            duration: renderedDuration,
          }),
          AVATAR_GENERATION_TIMEOUT_MS,
          "Talking avatar generation timed out"
        );
      } catch (err: any) {
        console.log(
          `[assemble] talking avatar generation failed, using static presenter: ${err.message}`
        );
      }
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
      presenterVideoUrl,
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    ""
  );
}

function resolveRenderDimensions(generationOptions?: any) {
  if (generationOptions?.format?.aspectRatio === "9:16") {
    return { width: LANDSCAPE_HEIGHT, height: LANDSCAPE_WIDTH };
  }
  return { width: LANDSCAPE_WIDTH, height: LANDSCAPE_HEIGHT };
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
  const casual = preset.includes("casual");
  const tone = casual
    ? "friendly, relaxed, and conversational"
    : preset.includes("editorial")
    ? "editorial, composed, and refined"
    : "warm, cinematic, and architectural";

  return [
    `Use a ${casual ? "natural" : "premium"} ${gender} narrator voice.`,
    `The delivery should be ${tone}.`,
    casual
      ? "Speak like a smart friend walking someone through a home, not like a luxury ad."
      : "Speak like a calm architectural documentary narrator.",
    casual
      ? "Keep it human, clear, lightly upbeat, and not too slow."
      : "Natural, intimate, understated, and slow.",
    "Leave clean pauses between short spoken lines.",
    "No realtor energy, no YouTube host energy, no corporate explainer tone.",
    "The voice should feel human and observant, not theatrical.",
  ].join(" ");
}

function getGeminiVoicePreset(voiceOptions: any) {
  const preset = String(voiceOptions?.voicePresetId || "");
  if (preset === "male-casual") return "Puck";
  if (preset === "male-editorial") return "Fenrir";
  if (preset === "female-casual") return "Callirrhoe";
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
    const ownerNotes = compactNarrationNote(project.propertyInfo?.narrationNotes);
    const hasOwnerNotes = ownerNotes.length > 0;
    const maxWords = voiceoverWordLimit(project, totalDuration);
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You write short spoken narration for social videos. The copy must sound like a real person talking over the footage, not a listing brochure, not generic luxury poetry, and not a brand manifesto.

Return JSON only:
{
  "voiceover": "spoken narration, max ${maxWords} words",
  "supportText": [
    { "clipIndex": 0, "headline": "Warm Timber Entry", "kicker": "Park City", "position": "bottom-left" }
  ]
}

Rules:
- Owner notes are hard requirements, not optional style guidance.
- If owner notes are provided, make them the primary content of the voiceover. Reuse the requested topics and plain nouns directly when natural.
- Do not translate casual notes into upscale real-estate language. If notes say hackathon, community, snacks, founders, families, remote work, etc., say those ideas plainly.
- It is okay if the requested content is not about real estate. Do not force every script into a home-tour or luxury framing.
- Use 2-5 short spoken lines. Natural cadence. Contractions are good. No rhyming. No grand abstractions.
- Start with the user-requested idea when owner notes are present; otherwise start with a grounded visual observation.
- Use visible home details only when they support the requested talking points.
- Support text should be 2 to 5 words, concrete/editorial, not room labels like "Kitchen".
- Use real details only from owner notes, detected photo features, address, price, and shot names.
- Add support text to 4-6 clips max: opening, living/kitchen, detail, outdoor, closing.
- Never say: welcome, stunning, beautiful, amazing, dream home, quiet luxury, designed to be felt, light and texture, private showings available, one of a kind, exceptional, elevated living.
- Do not mention price unless it is explicitly provided and useful as closing text.`,
        },
        {
          role: "user",
          content: `Property info:
Address: ${project.propertyInfo?.address || "(not provided)"}
Price: ${project.propertyInfo?.price || "(not provided)"}
Description: ${project.propertyInfo?.description || "(not provided)"}
Required talking points from user: ${ownerNotes || "(none)"}

If required talking points are present, the voiceover must clearly say those ideas. Do not replace them with generic luxury language.

Detected visual features:
${(project.sourceImages || []).filter((img: any) => img.features).map((img: any) => `- ${img.features}`).join("\n") || "(none)"}

Timeline clips:
${completedClips.map((clip, i) => {
  const shot = shots[clip.shotIndex];
  return `${i}: ${shot?.name || "Shot"} (${shot?.roomType || "unknown"})`;
}).join("\n")}

Total duration: ${Math.round(totalDuration)} seconds.`,
        },
        {
          role: "user",
          content: hasOwnerNotes
            ? `When user notes exist, good voiceover shape:
Line 1: say the user's main point plainly.
Line 2: connect it to one visible detail or use case.
Line 3: add another requested detail in normal spoken language.
Line 4: optional closing, only if it sounds like a person talking.

Bad voiceover for notes like "mention hackathon, community, and snacks":
"An elevated setting for collaboration, with thoughtful spaces and refined energy."

Good voiceover:
"This is the kind of place that actually works for a hackathon. There is room for people to spread out, enough space to build together, and yes, snacks close by all day."`
            : `Good voiceover shape:
Line 1: what we are seeing now.
Line 2: one concrete material, room, or design choice.
Line 3: how the home feels to move through.
Line 4: optional closing, only if it adds something specific.

Bad voiceover:
"A quieter kind of luxury. Light, texture, and quiet intention. A slower rhythm."

Good voiceover:
"The entry starts in warm timber and soft daylight. Inside, clean white rooms keep the focus on proportion, storage, and calm. Every space feels simple enough to live in, and considered enough to remember."`,
        },
      ],
      max_tokens: 900,
    });

    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    return normalizeEditPlan(parsed, fallback, completedClips.length, maxWords);
  } catch (err: any) {
    console.log(`[assemble] edit plan failed, using fallback: ${err.message}`);
    return fallback;
  }
}

function normalizeEditPlan(
  input: any,
  fallback: EditPlan,
  clipCount: number,
  maxVoiceoverWords: number
): EditPlan {
  const voiceover =
    typeof input?.voiceover === "string" && input.voiceover.trim()
      ? cleanVoiceover(input.voiceover, maxVoiceoverWords)
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

function cleanVoiceover(script: string, maxWords = 58) {
  const cleaned = script
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/^["']|["']$/g, "")
    .trim();
  if (!cleaned) return "";
  const words = cleaned.split(" ");
  if (words.length <= maxWords) return cleaned;
  return words.slice(0, maxWords).join(" ").replace(/[,:;–-]\s*$/, "").trim();
}

function voiceoverWordLimit(project: any, durationSeconds: number) {
  const hasNotes = compactNarrationNote(project.propertyInfo?.narrationNotes).length > 0;
  const wordsPerSecond = hasNotes ? 1.65 : 1.05;
  const minWords = hasNotes ? 28 : 24;
  const maxWords = hasNotes ? 86 : 58;
  return Math.max(minWords, Math.min(maxWords, Math.floor(durationSeconds * wordsPerSecond)));
}

function tightenVoiceover(script: string) {
  return cleanVoiceover(script, 58);
}

function buildFallbackEditPlan(project: any, completedClips: any[], shots: any[]): EditPlan {
  const address = project.propertyInfo?.address || "";
  const price = project.propertyInfo?.price || "";
  const location = shortLocation(address);
  const notes = compactNarrationNote(project.propertyInfo?.narrationNotes);
  const feature = firstUsefulFeature(project);
  const shotDetail = firstUsefulShotName(completedClips, shots);
  const supportText = completedClips
    .map((clip, i) => {
      const shot = shots[clip.shotIndex];
      const name = shot?.name || "";
      if (i === 0) {
        return {
          clipIndex: i,
          headline: notes || address ? firstSupportHeadline(notes, address) : "Easy to live in",
          kicker: address,
          position: "bottom-left" as const,
        };
      }
      if (/kitchen/i.test(name)) {
        return { clipIndex: i, headline: "Kitchen rhythm", position: "bottom-left" as const };
      }
      if (/detail|bath/i.test(name)) {
        return { clipIndex: i, headline: "Useful details", position: "bottom-left" as const };
      }
      if (/outdoor|pool|patio/i.test(name)) {
        return { clipIndex: i, headline: "Room outside", position: "bottom-left" as const };
      }
      if (i === completedClips.length - 1) {
        return {
          clipIndex: i,
          headline: price || "Worth a closer look",
          position: "bottom-left" as const,
        };
      }
      return null;
    })
    .filter(Boolean) as EditPlan["supportText"];

  return {
    voiceover: buildFallbackVoiceover({ location, notes, feature, shotDetail }),
    supportText,
  };
}

function buildFallbackVoiceover({
  location,
  notes,
  feature,
  shotDetail,
}: {
  location: string;
  notes: string;
  feature: string;
  shotDetail: string;
}) {
  if (notes) return cleanVoiceover(notes, 86);

  const opener = location
    ? `${location} sets the tone without forcing it.`
    : "The first read is calm and practical.";
  const detail = feature
    ? `What stands out is ${feature}.`
    : shotDetail
      ? `The edit moves through ${shotDetail.toLowerCase()}.`
      : "The rooms keep the focus on proportion, storage, and daily use.";
  return cleanVoiceover(
    `${opener} ${detail} It feels easy to understand, easy to move through, and practical enough for real life.`,
    58
  );
}

function firstSupportHeadline(notes: string, address: string) {
  const source = notes || address;
  const words = source
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 4);
  return words.length ? words.join(" ") : "Easy to live in";
}

function shortLocation(address: string) {
  const parts = String(address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : parts[0] || "";
}

function compactNarrationNote(value: string) {
  const note = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!note || note.length < 20) return "";
  return note.slice(0, 520).trim();
}

function firstUsefulFeature(project: any) {
  const features = (project.sourceImages || [])
    .map((img: any) => String(img.features || "").trim())
    .filter(Boolean)
    .join(", ");
  const match = features.match(
    /(warm wood|timber|marble|stone|fireplace|deck|patio|pool|natural light|vaulted|built-in|storage|pantry|view|garden|terrace|black tile|white oak|brass|concrete|skylight)[^,.]*/i
  );
  return match ? match[0].toLowerCase() : "";
}

function firstUsefulShotName(completedClips: any[], shots: any[]) {
  const shot = completedClips
    .map((clip) => shots[clip.shotIndex]?.name)
    .find((name) => name && !/hero|opening|closing/i.test(name));
  return shot || "";
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
<div data-composition-id="autohdr-video-studio" data-start="0" data-width="${LANDSCAPE_WIDTH}" data-height="${LANDSCAPE_HEIGHT}">
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
