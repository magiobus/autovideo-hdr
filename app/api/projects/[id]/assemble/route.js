import { NextResponse } from "next/server";
import connectDB from "@/libs/mongoose";
import Project from "@/models/Project";
import Style from "@/models/Style";
import openai from "@/libs/openai";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

export async function POST(request, { params }) {
  await connectDB();

  const { id } = await params;
  const project = await Project.findById(id);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.status === "completed" && project.finalVideoUrl) {
    return NextResponse.json({ message: "Already assembled" });
  }

  const style = await Style.findById(project.style).lean();
  const completedClips = project.clips
    .filter((c) => c.videoJob?.status === "completed" && c.videoUrl)
    .sort((a, b) => a.order - b.order);

  if (completedClips.length === 0) {
    return NextResponse.json({ error: "No completed clips" }, { status: 400 });
  }

  project.status = "assembling";
  await project.save();

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "autovideo-"));
  console.log(`[assembly] working dir: ${tmpDir}`);

  try {
    // ============================================
    // Step 1: Download all clip videos
    // ============================================
    console.log(`[assembly] downloading ${completedClips.length} clips...`);
    const clipPaths = [];

    for (let i = 0; i < completedClips.length; i++) {
      const clipPath = path.join(tmpDir, `clip-${i}.mp4`);
      const res = await fetch(completedClips[i].videoUrl);
      await fs.writeFile(clipPath, Buffer.from(await res.arrayBuffer()));
      clipPaths.push(clipPath);
    }

    // ============================================
    // Step 2: Normalize clips (consistent format, no audio)
    // ============================================
    console.log(`[assembly] normalizing clips...`);
    const normalizedPaths = [];

    for (let i = 0; i < clipPaths.length; i++) {
      const normalized = path.join(tmpDir, `normalized-${i}.mp4`);
      await execAsync(
        `ffmpeg -y -i "${clipPaths[i]}" -c:v libx264 -preset fast -crf 23 -r 30 -s 1920x1080 -pix_fmt yuv420p -an "${normalized}"`
      );
      normalizedPaths.push(normalized);
    }

    // ============================================
    // Step 3: Concatenate clips (video only, no audio)
    // ============================================
    const concatList = path.join(tmpDir, "concat.txt");
    await fs.writeFile(
      concatList,
      normalizedPaths.map((p) => `file '${p}'`).join("\n")
    );

    const concatOutput = path.join(tmpDir, "concat.mp4");
    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${concatOutput}"`
    );
    console.log(`[assembly] concatenated ${completedClips.length} clips`);

    const totalDuration = completedClips.reduce((sum, clip) => {
      const shot = style?.shots?.[clip.shotIndex];
      return sum + (shot?.duration || 5);
    }, 0);

    // ============================================
    // Step 4: Text overlays (on mute video — before audio)
    // ============================================
    let videoPath = concatOutput;

    const textClips = completedClips.filter((clip) => {
      const shot = style?.shots?.[clip.shotIndex];
      return shot?.textOverlay?.text;
    });

    if (textClips.length > 0 && project.propertyInfo) {
      console.log(`[assembly] adding text overlays...`);
      let timeOffset = 0;
      const drawFilters = [];

      for (const clip of completedClips) {
        const shot = style?.shots?.[clip.shotIndex];
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
          if (pos === "center") {
            y = "(h-th)/2";
          } else if (pos === "top-left") {
            x = "60";
            y = "60";
          } else if (pos === "top-center") {
            y = "60";
          }

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
        console.log(`[assembly] text overlays added`);
      }
    }

    // ============================================
    // Step 5: Generate voiceover script (GPT-4o)
    // ============================================
    let voiceoverPath = null;
    const voiceoverEnabled = style?.voiceover?.enabled !== false;

    if (voiceoverEnabled) {
      console.log(`[assembly] generating voiceover script...`);
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

      const script = scriptResponse.choices[0].message.content;
      console.log(`[assembly] voiceover script: "${script.substring(0, 100)}..."`);

      // ============================================
      // Step 6: Generate TTS audio (OpenAI)
      // ============================================
      console.log(`[assembly] generating TTS audio...`);
      const voiceSettings = style?.voiceover || {};
      const voice = voiceSettings.voice || "shimmer";
      const speed = voiceSettings.speed || 0.95;

      const speechResponse = await openai.audio.speech.create({
        input: script,
        model: "tts-1",
        voice,
        response_format: "mp3",
        speed,
      });

      voiceoverPath = path.join(tmpDir, "voiceover.mp3");
      await fs.writeFile(
        voiceoverPath,
        Buffer.from(await speechResponse.arrayBuffer())
      );
      console.log(`[assembly] voiceover generated (${voice}, ${speed}x speed)`);
    }

    // ============================================
    // Step 7: Add audio (voiceover + music) — LAST STEP before upload
    // ============================================
    let finalPath = videoPath;
    let musicPath = null;

    if (style?.musicUrl) {
      try {
        const musicRes = await fetch(style.musicUrl);
        if (musicRes.ok) {
          musicPath = path.join(tmpDir, "music.mp3");
          await fs.writeFile(
            musicPath,
            Buffer.from(await musicRes.arrayBuffer())
          );
        }
      } catch {
        console.log(`[assembly] music download failed, skipping`);
      }
    }

    if (voiceoverPath && musicPath) {
      console.log(`[assembly] mixing voiceover + music...`);
      finalPath = path.join(tmpDir, "final.mp4");
      await execAsync(
        `ffmpeg -y -i "${videoPath}" -i "${voiceoverPath}" -i "${musicPath}" ` +
          `-filter_complex "[2:a]volume=0.15[bg];[1:a][bg]amix=inputs=2:duration=first[a]" ` +
          `-map 0:v -map "[a]" -c:v copy -c:a aac -shortest "${finalPath}"`
      );
    } else if (voiceoverPath) {
      console.log(`[assembly] adding voiceover...`);
      finalPath = path.join(tmpDir, "final.mp4");
      await execAsync(
        `ffmpeg -y -i "${videoPath}" -i "${voiceoverPath}" ` +
          `-map 0:v -map 1:a -c:v copy -c:a aac -shortest "${finalPath}"`
      );
    } else if (musicPath) {
      console.log(`[assembly] adding music...`);
      finalPath = path.join(tmpDir, "final.mp4");
      await execAsync(
        `ffmpeg -y -i "${videoPath}" -i "${musicPath}" ` +
          `-map 0:v -map 1:a -c:v copy -c:a aac -shortest "${finalPath}"`
      );
    }

    console.log(`[assembly] audio done → ${finalPath}`);

    // ============================================
    // Step 8: Upload to R2
    // ============================================
    console.log(`[assembly] uploading final video to R2...`);
    const finalBuffer = await fs.readFile(finalPath);
    const r2Key = `projects/${project._id}/final.mp4`;

    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });

    await r2Client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: r2Key,
        Body: finalBuffer,
        ContentType: "video/mp4",
      })
    );

    const finalVideoUrl = `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${r2Key}`;

    project.finalVideoUrl = finalVideoUrl;
    project.finalVideoKey = r2Key;
    project.status = "completed";
    project.progress = 100;
    await project.save();

    console.log(`[assembly] DONE! ${finalVideoUrl}`);
    await fs.rm(tmpDir, { recursive: true, force: true });

    return NextResponse.json({
      finalVideoUrl,
      clipsUsed: completedClips.length,
    });
  } catch (err) {
    console.error(`[assembly] failed:`, err.message);
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    project.status = "failed";
    await project.save();
    return NextResponse.json(
      { error: "Assembly failed: " + err.message },
      { status: 500 }
    );
  }
}
