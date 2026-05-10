import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import connectDB from "@/libs/mongoose";
import Project from "@/models/Project";
import { tasks } from "@trigger.dev/sdk";

export async function POST(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const { id } = await params;
  const project = await Project.findOne({ _id: id, user: session.user.id });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!project.editorState) {
    return NextResponse.json({ error: "Editor state not ready" }, { status: 400 });
  }

  project.status = "rendering";
  project.progress = 95;
  project.editorState.render = {
    ...(project.editorState.render || {}),
    status: "rendering",
    error: undefined,
  };
  project.markModified("editorState");
  await project.save();

  await tasks.trigger("video-render", {
    projectId: project._id.toString(),
  });

  return NextResponse.json({ status: "rendering" });
}
