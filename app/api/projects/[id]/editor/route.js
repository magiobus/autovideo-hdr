import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import connectDB from "@/libs/mongoose";
import Project from "@/models/Project";

export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const { id } = await params;
  const body = await request.json();
  const editorState = body?.editorState;
  if (!editorState?.tracks || editorState.version !== 1) {
    return NextResponse.json({ error: "Invalid editorState" }, { status: 400 });
  }

  const project = await Project.findOne({ _id: id, user: session.user.id });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const duration = getEditorDuration(editorState);

  project.editorState = {
    ...editorState,
    duration,
    render: {
      ...(editorState.render || {}),
      status: "dirty",
      error: undefined,
    },
  };
  project.markModified("editorState");
  await project.save();

  return NextResponse.json({
    editorState: project.editorState,
  });
}

function getEditorDuration(editorState) {
  const itemEnds = (editorState.tracks || [])
    .flatMap((track) => track.items || [])
    .map((item) => Number(item.start || 0) + Number(item.duration || 0));
  return Math.max(0.1, ...itemEnds);
}
