import { NextResponse } from "next/server";
import connectDB from "@/libs/mongoose";
import Style from "@/models/Style";

export async function GET(request, { params }) {
  await connectDB();

  const { id } = await params;
  const style = await Style.findById(id).lean();

  if (!style) {
    return NextResponse.json({ error: "Style not found" }, { status: 404 });
  }

  return NextResponse.json({ ...style, _id: style._id.toString() });
}
