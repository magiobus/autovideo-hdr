import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import connectDB from "@/libs/mongoose";
import Project from "@/models/Project";
import { syncPresenterAvatarForProject } from "@/trigger/steps/presenter-avatar";

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

  const voiceover = findEditorItem(project.editorState, "voiceover");
  const presenter = findEditorItem(project.editorState, "presenter-bubble");
  if (!voiceover?.sourceUrl && !project.editorState.artifacts?.voiceoverUrl) {
    return NextResponse.json({ error: "Voiceover is required" }, { status: 400 });
  }
  if (!presenter) {
    return NextResponse.json({ error: "Presenter bubble is not enabled" }, { status: 400 });
  }

  project.editorState.avatar = {
    ...(project.editorState.avatar || {}),
    status: "generating",
    error: undefined,
    startedAt: new Date().toISOString(),
  };
  project.markModified("editorState");
  await project.save();

  const result = await syncPresenterAvatarForProject(project._id.toString());
  return NextResponse.json({ status: "rendered", ...result });
}

function findEditorItem(editorState, itemId) {
  return (editorState.tracks || [])
    .flatMap((track) => track.items || [])
    .find((item) => item.id === itemId);
}
