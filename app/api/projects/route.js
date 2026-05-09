import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import connectDB from "@/libs/mongoose";
import Project from "@/models/Project";
import Style from "@/models/Style";
import { mastra } from "@/mastra/index";

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const { styleId, sourceImages, propertyInfo } = await request.json();

  if (!styleId || !sourceImages?.length) {
    return NextResponse.json(
      { error: "styleId and sourceImages are required" },
      { status: 400 }
    );
  }

  const style = await Style.findById(styleId).lean();
  if (!style) {
    return NextResponse.json({ error: "Style not found" }, { status: 404 });
  }

  // Create project
  const project = await Project.create({
    user: session.user.id,
    style: styleId,
    propertyInfo,
    sourceImages: sourceImages.map((img) => ({
      url: img.url,
      key: img.key,
    })),
    status: "classifying",
  });

  // Run Mastra workflow (classify + match)
  try {
    const workflow = mastra.getWorkflow("videoGenerationWorkflow");
    const run = await workflow.createRunAsync();

    const result = await run.start({
      inputData: {
        imageUrls: sourceImages.map((img) => img.url),
        imageKeys: sourceImages.map((img) => img.key),
        shots: style.shots.map((s) => ({
          order: s.order,
          roomType: s.roomType,
          name: s.name || "",
        })),
      },
    });

    // Debug the full result shape
    console.log("=== WORKFLOW RESULT ===");
    console.log("status:", result.status);
    console.log("keys:", Object.keys(result));
    console.log("steps keys:", result.steps ? Object.keys(result.steps) : "no steps");
    console.log("results keys:", result.results ? Object.keys(result.results) : "no results");

    if (result.status === "failed") {
      const errMsg = typeof result.error === "string"
        ? result.error.split("\n")[0]
        : JSON.stringify(result.error);
      console.error("Workflow failed:", errMsg);
      await Project.findByIdAndUpdate(project._id, { status: "failed" });
      return NextResponse.json(
        { error: "Classification failed: " + errMsg },
        { status: 500 }
      );
    }

    // Try both result.steps and result.results (Mastra API varies)
    const stepsData = result.steps || result.results || {};
    const classifyStep = stepsData["classify"];
    const matchStep = stepsData["match"];

    const matchResult = matchStep?.output;
    const classifyResult = classifyStep?.output;

    console.log("classify:", classifyStep?.status, "output keys:", classifyResult ? Object.keys(classifyResult) : "none");
    console.log("match:", matchStep?.status, "clips:", matchResult?.clips?.length);

    if (!matchResult?.clips?.length) {
      await Project.findByIdAndUpdate(project._id, { status: "failed", progress: 0 });
      return NextResponse.json(
        { error: "No photos matched the style shots" },
        { status: 400 }
      );
    }

    const updatedImages = sourceImages.map((img) => {
      const classification = classifyResult?.classifications?.find(
        (c) => c.url === img.url
      );
      return {
        url: img.url,
        key: img.key,
        classification: classification?.roomType || "unknown",
        confidence: classification?.confidence || 0,
      };
    });

    const clips = matchResult.clips.map((clip) => ({
      order: clip.order,
      shotIndex: clip.shotIndex,
      sourceImageUrl: clip.sourceImageUrl,
      imageJob: { status: "pending" },
      videoJob: { status: "pending" },
    }));

    await Project.findByIdAndUpdate(project._id, {
      sourceImages: updatedImages,
      clips,
      status: "generating",
      progress: 10,
    });

    return NextResponse.json({
      projectId: project._id.toString(),
      clipsCount: clips.length,
      unmatchedPhotos: matchResult.unmatchedPhotos?.length || 0,
      unmatchedShots: matchResult.unmatchedShots?.length || 0,
    });
  } catch (err) {
    console.error("Workflow error:", err);
    await Project.findByIdAndUpdate(project._id, {
      status: "failed",
    });
    return NextResponse.json(
      { error: "Classification failed: " + err.message },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const projects = await Project.find({ user: session.user.id })
    .populate("style", "name slug aspectRatio")
    .sort({ createdAt: -1 })
    .lean();

  const result = projects.map((p) => ({
    ...p,
    _id: p._id.toString(),
    user: p.user.toString(),
    style: p.style
      ? { ...p.style, _id: p.style._id.toString() }
      : null,
  }));

  return NextResponse.json(result);
}
