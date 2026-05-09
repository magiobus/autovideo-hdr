import { NextResponse } from "next/server";
import connectDB from "@/libs/mongoose";
import Project from "@/models/Project";
import Style from "@/models/Style";
import { downloadAndStoreToR2 } from "@/helpers/downloadAndStoreToR2";
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
  const completedClips = project.clips.filter(
    (c) => c.videoJob?.status === "completed" && c.videoUrl
  );

  if (completedClips.length === 0) {
    return NextResponse.json({ error: "No completed clips" }, { status: 400 });
  }

  // Sort by order
  completedClips.sort((a, b) => a.order - b.order);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "autovideo-"));
  console.log(`[assembly] working dir: ${tmpDir}`);

  try {
    // Step 1: Download all clip videos
    console.log(`[assembly] downloading ${completedClips.length} clips...`);
    const clipPaths = [];

    for (let i = 0; i < completedClips.length; i++) {
      const clip = completedClips[i];
      const clipPath = path.join(tmpDir, `clip-${i}.mp4`);

      const res = await fetch(clip.videoUrl);
      const buffer = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(clipPath, buffer);

      clipPaths.push(clipPath);
      console.log(`[assembly] downloaded clip ${i}: ${clipPath}`);
    }

    // Step 2: Re-encode clips to ensure consistent format
    console.log(`[assembly] re-encoding clips for concat compatibility...`);
    const normalizedPaths = [];

    for (let i = 0; i < clipPaths.length; i++) {
      const normalized = path.join(tmpDir, `normalized-${i}.mp4`);
      await execAsync(
        `ffmpeg -y -i "${clipPaths[i]}" -c:v libx264 -preset fast -crf 23 -r 30 -s 1920x1080 -pix_fmt yuv420p -an "${normalized}"`
      );
      normalizedPaths.push(normalized);
    }

    // Step 3: Create concat list
    const concatList = path.join(tmpDir, "concat.txt");
    const concatContent = normalizedPaths
      .map((p) => `file '${p}'`)
      .join("\n");
    await fs.writeFile(concatList, concatContent);

    // Step 4: Concatenate
    const concatOutput = path.join(tmpDir, "concat.mp4");
    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${concatOutput}"`
    );
    console.log(`[assembly] concatenated → ${concatOutput}`);

    // Step 5: Add music if style has one
    let finalPath = concatOutput;

    if (style?.musicUrl) {
      console.log(`[assembly] adding music...`);
      const musicPath = path.join(tmpDir, "music.mp3");
      const musicRes = await fetch(style.musicUrl);
      const musicBuffer = Buffer.from(await musicRes.arrayBuffer());
      await fs.writeFile(musicPath, musicBuffer);

      const withMusic = path.join(tmpDir, "with-music.mp4");
      await execAsync(
        `ffmpeg -y -i "${concatOutput}" -i "${musicPath}" -map 0:v -map 1:a -c:v copy -c:a aac -shortest "${withMusic}"`
      );
      finalPath = withMusic;
      console.log(`[assembly] music added → ${finalPath}`);
    }

    // Step 6: Add text overlays with FFmpeg drawtext
    // (Hyperframes can be added later for fancier text; FFmpeg drawtext works for MVP)
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
          // Replace template variables
          let text = shot.textOverlay.text
            .replace("{{address}}", project.propertyInfo.address || "")
            .replace("{{price}}", project.propertyInfo.price || "")
            .replace("{{description}}", project.propertyInfo.description || "")
            .replace(/'/g, "'\\''")
            .replace(/:/g, "\\:");

          const startAt = timeOffset + (shot.textOverlay.startAt || 0);
          const endAt = startAt + (shot.textOverlay.duration || 3);

          drawFilters.push(
            `drawtext=text='${text}':fontsize=42:fontcolor=white:borderw=2:bordercolor=black:x=(w-tw)/2:y=h-80:enable='between(t,${startAt},${endAt})'`
          );
        }
        // Accumulate time offset (each clip's duration)
        timeOffset += shot?.duration || 5;
      }

      if (drawFilters.length > 0) {
        const withText = path.join(tmpDir, "final.mp4");
        const filterStr = drawFilters.join(",");
        await execAsync(
          `ffmpeg -y -i "${finalPath}" -vf "${filterStr}" -c:a copy "${withText}"`
        );
        finalPath = withText;
        console.log(`[assembly] text overlays added → ${finalPath}`);
      }
    }

    // Step 7: Upload to R2
    console.log(`[assembly] uploading final video to R2...`);
    const finalBuffer = await fs.readFile(finalPath);
    const r2Key = `projects/${project._id}/final.mp4`;

    // Upload directly using S3 SDK
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

    // Step 8: Update project
    project.finalVideoUrl = finalVideoUrl;
    project.finalVideoKey = r2Key;
    project.status = "completed";
    project.progress = 100;
    await project.save();

    console.log(`[assembly] DONE! ${finalVideoUrl}`);

    // Cleanup temp dir
    await fs.rm(tmpDir, { recursive: true, force: true });

    return NextResponse.json({
      finalVideoUrl,
      clipsUsed: completedClips.length,
    });
  } catch (err) {
    console.error(`[assembly] failed:`, err.message);

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    project.status = "failed";
    await project.save();

    return NextResponse.json(
      { error: "Assembly failed: " + err.message },
      { status: 500 }
    );
  }
}
