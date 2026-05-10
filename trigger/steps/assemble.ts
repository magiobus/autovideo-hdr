import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { connectDB, getModels, getOpenAI, getR2Client, configureFal, fal } from "../helpers";

const execFileAsync = promisify(execFile);

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
    for (let i = 0; i < clipPaths.length; i++) {
      const normalized = path.join(tmpDir, `normalized-${i}.mp4`);
      await ffmpeg([
        "-y",
        "-i",
        clipPaths[i],
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-r",
        "30",
        "-s",
        "1920x1080",
        "-pix_fmt",
        "yuv420p",
        "-an",
        normalized,
      ]);
      normalizedPaths.push(normalized);
    }

    // ── 3. Concatenate ──
    const concatList = path.join(tmpDir, "concat.txt");
    await fs.writeFile(
      concatList,
      normalizedPaths.map((p) => `file '${p}'`).join("\n")
    );
    const concatOutput = path.join(tmpDir, "concat.mp4");
    await ffmpeg(["-y", "-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", concatOutput]);
    console.log(`[assemble] concatenated`);

    const shots = styleData?.shots || [];
    const totalDuration = completedClips.reduce((sum: number, clip: any) => {
      const shot = shots[clip.shotIndex];
      return sum + (shot?.duration || 5);
    }, 0);

    // ── 4. Text overlays ──
    let videoPath = concatOutput;

    const textClips = completedClips.filter((clip: any) => {
      const shot = shots[clip.shotIndex];
      return shot?.textOverlay?.text;
    });

    if (textClips.length > 0 && project.propertyInfo) {
      let timeOffset = 0;
      const drawFilters: string[] = [];

      for (const [clipIndex, clip] of completedClips.entries()) {
        const shot = shots[clip.shotIndex];
        if (shot?.textOverlay?.text) {
          const text = shot.textOverlay.text
            .replace("{{address}}", project.propertyInfo.address || "")
            .replace("{{price}}", project.propertyInfo.price || "")
            .replace("{{description}}", project.propertyInfo.description || "");
          const textFile = path.join(tmpDir, `overlay-${clipIndex}.txt`);
          await fs.writeFile(textFile, text, "utf8");

          const overlayStart = timeOffset + (shot.textOverlay.startAt || 0);
          const overlayEnd = overlayStart + (shot.textOverlay.duration || 3);
          const fadeIn = overlayStart + 0.3;
          const fadeOut = overlayEnd - 0.3;

          const pos = shot.textOverlay.position || "bottom-center";
          let x = "(w-tw)/2";
          let y = "h-100";
          if (pos === "center") y = "(h-th)/2";
          else if (pos === "top-left") { x = "60"; y = "60"; }
          else if (pos === "top-center") y = "60";

          drawFilters.push(
            `drawtext=textfile=${escapeFilterValue(textFile)}:fontsize=52:fontcolor=white:` +
              `box=1:boxcolor=black@0.4:boxborderw=20:` +
              `x=${x}:y=${y}:` +
              `enable='between(t,${overlayStart},${overlayEnd})':` +
              `alpha='if(lt(t,${fadeIn}),(t-${overlayStart})/0.3,if(gt(t,${fadeOut}),(${overlayEnd}-t)/0.3,1))'`
          );
        }
        timeOffset += shot?.duration || 5;
      }

      if (drawFilters.length > 0) {
        const withText = path.join(tmpDir, "with-text.mp4");
        await ffmpeg([
          "-y",
          "-i",
          videoPath,
          "-vf",
          drawFilters.join(","),
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "23",
          withText,
        ]);
        videoPath = withText;
        console.log(`[assemble] text overlays added`);
      }
    }

    // ── 5. Voiceover ──
    let voiceoverPath: string | null = null;
    const voiceoverEnabled = styleData?.voiceover?.enabled !== false;

    if (voiceoverEnabled) {
      console.log(`[assemble] generating voiceover…`);
      const openai = getOpenAI();
      // Sparse narration: ~1 word per second, lots of breathing room
      const maxWords = Math.floor(totalDuration * 1.0);

      const scriptResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a world-class luxury real estate video narrator. You write sparse, cinematic, poetic scripts — NOT informational tours.

Your style reference (study this tone):
"What if I told you the best part of this house wasn't a room at all, but 8,000 square feet of sky and stone? Deer Valley's East Village in Park City, Utah. First residence in a rising village. Ski to the terrace. Boots off. Sauna steam. Inside, radiant floors. Floor to ceiling glass, walnut, and white oak. Access close. Horizon wide."

Key principles:
- Sell the EXPERIENCE and FEELING, never describe rooms like a brochure
- Use short, punchy sentence fragments. "Boots off. Sauna steam." NOT "The home features a sauna."
- Mention real materials and textures when provided (walnut, marble, glass)
- Open with a provocative hook — a question, a contrast, an image — NEVER "Welcome to..."
- NEVER invent features, amenities, or details that aren't in the provided description
- If you don't have enough info, be poetic about the FEELING of the space
- Address and location should feel woven in naturally, not announced
- Price only if provided, mentioned casually at the end or not at all
- Leave room for silence — the video breathes on its own
- Maximum ${maxWords} words. Less is more. Every word must earn its place.`,
          },
          {
            role: "user",
            content: `Write the narration script for this property video.

ADDRESS: ${project.propertyInfo?.address || "(not provided)"}
PRICE: ${project.propertyInfo?.price || "(not provided)"}
DESCRIPTION: ${project.propertyInfo?.description || "(not provided)"}

OWNER'S NOTES (things they want mentioned):
${project.propertyInfo?.narrationNotes || "(none)"}

VISUAL FEATURES DETECTED IN PHOTOS:
${(project.sourceImages || []).filter((img: any) => img.features).map((img: any) => `- ${img.features}`).join("\n") || "(none)"}

Video: ${totalDuration} seconds, ${completedClips.length} scenes.

IMPORTANT:
- Use the owner's notes as guidance for what to highlight
- Use the detected visual features for specific, real details (materials, textures, views)
- NEVER invent features not present in the notes or detected features
- If there's very little info, keep it extremely minimal — mood and atmosphere only
- Weave the real details into the poetic narration naturally

Return ONLY the narration text. No stage directions, no timestamps, no labels.`,
          },
        ],
      });

      const script = scriptResponse.choices[0].message.content!;
      console.log(`[assemble] voiceover script: "${script.substring(0, 120)}…"`);

      // ── Gemini TTS via Fal ──
      configureFal();
      const ttsResult = await fal.subscribe("fal-ai/gemini-tts", {
        input: {
          prompt: script,
          model: "gemini-2.5-flash-tts",
          style_instructions:
            "Speak slowly and deliberately, like a luxury brand narrator. Deep, warm, confident voice. Long pauses between sentences — let the words breathe. Understated, not dramatic. Think Rolex ad, not infomercial.",
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
        await fs.writeFile(voiceoverPath, Buffer.from(await audioRes.arrayBuffer()));
        console.log(`[assemble] TTS done (Gemini 2.5 Flash TTS)`);
      }
    }

    // ── 6. Mix audio ──
    let finalPath = videoPath;
    let musicPath: string | null = null;

    if (styleData?.musicUrl) {
      try {
        const musicRes = await fetch(styleData.musicUrl);
        if (musicRes.ok) {
          musicPath = path.join(tmpDir, "music.mp3");
          await fs.writeFile(musicPath, Buffer.from(await musicRes.arrayBuffer()));
        }
      } catch {
        console.log(`[assemble] music download failed, skipping`);
      }
    }

    if (voiceoverPath && musicPath) {
      finalPath = path.join(tmpDir, "final.mp4");
      await ffmpeg([
        "-y",
        "-i",
        videoPath,
        "-i",
        voiceoverPath,
        "-i",
        musicPath,
        "-filter_complex",
        "[2:a]volume=0.15[bg];[1:a][bg]amix=inputs=2:duration=first[a]",
        "-map",
        "0:v",
        "-map",
        "[a]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-shortest",
        finalPath,
      ]);
    } else if (voiceoverPath) {
      finalPath = path.join(tmpDir, "final.mp4");
      await ffmpeg([
        "-y",
        "-i",
        videoPath,
        "-i",
        voiceoverPath,
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-shortest",
        finalPath,
      ]);
    } else if (musicPath) {
      finalPath = path.join(tmpDir, "final.mp4");
      await ffmpeg([
        "-y",
        "-i",
        videoPath,
        "-i",
        musicPath,
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-shortest",
        finalPath,
      ]);
    }

    console.log(`[assemble] audio done`);

    // ── 7. Upload to R2 ──
    console.log(`[assemble] uploading to R2…`);
    const finalBuffer = await fs.readFile(finalPath);
    const r2Key = `projects/${projectId}/final.mp4`;
    const r2 = getR2Client();
    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: r2Key,
        Body: finalBuffer,
        ContentType: "video/mp4",
      })
    );

    const finalVideoUrl = `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${r2Key}`;

    project.finalVideoUrl = finalVideoUrl;
    project.finalVideoKey = r2Key;
    project.status = "completed";
    project.progress = 100;
    await project.save();

    console.log(`[assemble] DONE! ${finalVideoUrl}`);
    await fs.rm(tmpDir, { recursive: true, force: true });

    return projectId;
  } catch (err: any) {
    console.log(`[assemble] FAILED: ${err.message}`);
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    project.status = "failed";
    await project.save();
    throw err;
  }
}

async function ffmpeg(args: string[]) {
  await execFileAsync("ffmpeg", args, { maxBuffer: 1024 * 1024 * 20 });
}

function escapeFilterValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
}
