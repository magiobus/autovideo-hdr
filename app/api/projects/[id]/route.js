import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import connectDB from "@/libs/mongoose";
import Project from "@/models/Project";
import "@/models/Style";

export async function GET(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const { id } = await params;
  const project = await Project.findOne({
    _id: id,
    user: session.user.id,
  })
    .populate("style")
    .lean();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...project,
    _id: project._id.toString(),
    user: project.user.toString(),
    style: project.style
      ? { ...project.style, _id: project.style._id.toString() }
      : null,
  });
}
