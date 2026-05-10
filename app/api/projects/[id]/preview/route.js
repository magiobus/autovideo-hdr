import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import connectDB from "@/libs/mongoose";
import Project from "@/models/Project";
import { buildHyperframesComposition } from "@/libs/editor/hyperframes-composition";

export async function GET(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  await connectDB();

  const { id } = await params;
  const project = await Project.findOne({ _id: id, user: session.user.id }).lean();
  if (!project) {
    return new NextResponse("Project not found", { status: 404 });
  }
  if (!project.editorState) {
    return new NextResponse("Editor state not ready", { status: 404 });
  }

  return new NextResponse(
    buildHyperframesComposition(project.editorState, { includePreviewRuntime: true }),
    {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
    }
  );
}
