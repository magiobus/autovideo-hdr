import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { connectDB, getModels, getOpenAI, getR2Client, configureFal, fal } from "../helpers";

const execAsync = promisify(exec);

export async function assemble(projectId: string): Promise<string> {
  await connectDB();
  const { Project, Style } = await getModels();

  const project = await Project.findById(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

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

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "autovideo-"));
  console.log(`[assemble] tmpDir: ${tmpDir}, clips: ${completedClips.length}`);

  try {
    // ── 1. Download clips ──
    console.log(`[assemble] downloading clips…`);
    const clipPaths: string[] = [];
    for (let i = 0; i < completedClips.length; i++) {
      const clipPath = path.join(tmpDir, `clip-${i}.mp4`);
      const res = await fetch(completedClips[i].videoUrl);
      await fs.writeFile(clipPath, Buffer.from(await res.arrayBuffer()));
      clipPaths.push(clipPath);
    }

    // ── 2. Normalize clips ──
    console.log(`[assemble] normalizing…`);
    const normalizedPaths: string[] = [];
    for (let i = 0; i < clipPaths.length; i++) {
      const normalized = path.join(tmpDir, `normalized-${i}.mp4`);
      await execAsync(
        `ffmpeg -y -i "${clipPaths[i]}" -c:v libx264 -preset fast -crf 23 -r 30 -s 1920x1080 -pix_fmt yuv420p -an "${normalized}"`
      );
      normalizedPaths.push(normalized);
    }

    // ── 3. Concatenate ──
    const concatList = path.join(tmpDir, "concat.txt");
    await fs.writeFile(
      concatList,
      normalizedPaths.map((p) => `file '${p}'`).join("\n")
    );
    const concatOutput = path.join(tmpDir, "concat.mp4");
    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${concatOutput}"`
    );
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

      for (const clip of completedClips) {
        const shot = shots[clip.shotIndex];
        if (shot?.textOverlay?.text) {
          let text = shot.textOverlay.text
            .replace("{{address}}", project.propertyInfo.address || "")
            .replace("{{price}}", project.propertyInfo.price || "")
            .replace("{{description}}", project.propertyInfo.description || "")
            .replace(/'/g, "'\\''")
            .replace(/:/g, "\\:");

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
            `drawtext=text='${text}':fontsize=52:fontcolor=white:` +
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
        await execAsync(
          `ffmpeg -y -i "${videoPath}" -vf "${drawFilters.join(",")}" -c:v libx264 -preset fast -crf 23 "${withText}"`
        );
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
      const maxWords = Math.floor(totalDuration * 2.2);

      const scriptResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: `Write a short, professional real estate video narration script.

Property: ${project.propertyInfo?.address || "Luxury Property"}
Price: ${project.propertyInfo?.price || "Contact for pricing"}
Description: ${project.propertyInfo?.description || "A beautiful, well-appointed home with stunning features throughout"}
Video duration: ${totalDuration} seconds, ${completedClips.length} scenes.

Rules:
- Maximum ${maxWords} words (about 2.2 words per second pace)
- Professional, warm, inviting tone — like a luxury real estate video tour
- Mention the address naturally at the start
- Mention the price at the end if provided
- Flowing narration, NO bullet points or lists
- Return ONLY the script text, nothing else`,
          },
        ],
      });

      const script = scriptResponse.choices[0].message.content!;
      console.log(`[assemble] voiceover script: "${script.substring(0, 80)}…"`);

      // ── Gemini TTS via Fal ──
      configureFal();
      const ttsResult = await fal.subscribe("fal-ai/gemini-tts", {
        input: {
          prompt: script,
          model: "gemini-2.5-flash-tts",
          style_instructions:
            "Speak in a warm, confident, and polished tone — like a luxury real estate video narrator. Pace yourself slowly and clearly. Slight pauses between sentences for elegance. Sound natural and human, not robotic.",
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
      await execAsync(
        `ffmpeg -y -i "${videoPath}" -i "${voiceoverPath}" -i "${musicPath}" ` +
          `-filter_complex "[2:a]volume=0.15[bg];[1:a][bg]amix=inputs=2:duration=first[a]" ` +
          `-map 0:v -map "[a]" -c:v copy -c:a aac -shortest "${finalPath}"`
      );
    } else if (voiceoverPath) {
      finalPath = path.join(tmpDir, "final.mp4");
      await execAsync(
        `ffmpeg -y -i "${videoPath}" -i "${voiceoverPath}" ` +
          `-map 0:v -map 1:a -c:v copy -c:a aac -shortest "${finalPath}"`
      );
    } else if (musicPath) {
      finalPath = path.join(tmpDir, "final.mp4");
      await execAsync(
        `ffmpeg -y -i "${videoPath}" -i "${musicPath}" ` +
          `-map 0:v -map 1:a -c:v copy -c:a aac -shortest "${finalPath}"`
      );
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
