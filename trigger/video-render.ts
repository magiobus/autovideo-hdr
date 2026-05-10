import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { task, logger } from "@trigger.dev/sdk";
import { buildHyperframesComposition } from "@/libs/editor/hyperframes-composition";
import { connectDB, getModels, getR2Client } from "./helpers";

const execFileAsync = promisify(execFile);

export const videoRenderTask = task({
  id: "video-render",
  machine: {
    preset: "small-2x",
  },
  run: async ({ projectId }: { projectId: string }) => {
    return renderVideoProject(projectId);
  },
});

export async function renderVideoProject(projectId: string) {
  await connectDB();
  const { Project } = await getModels();
  const project = await Project.findById(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);
  if (!project.editorState) throw new Error("Editor state not ready");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "autovideo-render-"));
  const outputPath = path.join(tmpDir, "final.mp4");

  try {
    logger.info("Rendering HyperFrames composition", { projectId });
    project.status = "rendering";
    project.progress = 96;
    project.editorState.render = {
      ...(project.editorState.render || {}),
      status: "rendering",
      error: undefined,
    };
    project.markModified("editorState");
    await project.save();

    const html = buildHyperframesComposition(project.editorState);
    await fs.writeFile(path.join(tmpDir, "index.html"), html, "utf8");

    await runHyperframes(tmpDir, outputPath);

    const r2Key = `projects/${projectId}/final.mp4`;
    const r2 = getR2Client();
    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: r2Key,
        Body: await fs.readFile(outputPath),
        ContentType: "video/mp4",
      })
    );

    const finalVideoUrl = `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${r2Key}`;
    project.finalVideoUrl = finalVideoUrl;
    project.finalVideoKey = r2Key;
    project.editorState.render = {
      ...(project.editorState.render || {}),
      status: "rendered",
      finalVideoUrl,
      finalVideoKey: r2Key,
      renderedAt: new Date().toISOString(),
      error: undefined,
    };
    project.status = "completed";
    project.progress = 100;
    project.markModified("editorState");
    await project.save();
    logger.info("Render complete", { projectId, finalVideoUrl });
    return { projectId, finalVideoUrl };
  } catch (err: any) {
    logger.error("Render failed", { projectId, error: err.message });
    project.status = "editing";
    project.editorState.render = {
      ...(project.editorState.render || {}),
      status: "failed",
      error: err.message,
    };
    project.markModified("editorState");
    await project.save();
    throw err;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function runHyperframes(cwd: string, outputPath: string) {
  const hyperframesBin = path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    "hyperframes"
  );
  try {
    await execFileAsync(hyperframesBin, ["lint"], {
      cwd,
      maxBuffer: 1024 * 1024 * 20,
    });
  } catch (err: any) {
    logger.warn("HyperFrames lint failed; attempting render anyway", {
      error: err.message,
    });
  }
  await execFileAsync(
    hyperframesBin,
    ["render", "--output", outputPath, "--fps", "30", "--quality", "high", "--workers", "1"],
    {
      cwd,
      maxBuffer: 1024 * 1024 * 40,
    }
  );
}
