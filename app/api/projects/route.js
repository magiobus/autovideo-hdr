import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import connectDB from "@/libs/mongoose";
import Project from "@/models/Project";
import Style from "@/models/Style";
import { tasks } from "@trigger.dev/sdk";

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const { styleId, sourceImages, propertyInfo, generationOptions } =
    await request.json();

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
    name: "Video Studio Project",
    propertyInfo,
    generationOptions,
    sourceImages: sourceImages.map((img) => ({
      url: img.url,
      key: img.key,
    })),
    status: "classifying",
  });

  // Trigger background job — runs on Trigger.dev infrastructure.
  // The frontend polls GET /projects/:id for status.
  await tasks.trigger("video-pipeline", {
    projectId: project._id.toString(),
  });

  return NextResponse.json({
    projectId: project._id.toString(),
    status: "classifying",
  });
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
