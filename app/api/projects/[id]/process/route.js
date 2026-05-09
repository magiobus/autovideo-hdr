import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import connectDB from "@/libs/mongoose";
import Project from "@/models/Project";

/**
 * Legacy endpoint — the Mastra workflow now handles all processing.
 * This just returns the current project state for backwards compatibility.
 */
export async function POST(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const { id } = await params;
  const project = await Project.findOne({
    _id: id,
    user: session.user.id,
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json(project.toJSON());
}
