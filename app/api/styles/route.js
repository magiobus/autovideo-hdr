import { NextResponse } from "next/server";
import connectDB from "@/libs/mongoose";
import Style from "@/models/Style";

export async function GET() {
  await connectDB();

  const styles = await Style.find({ isPublic: true })
    .select("name slug description thumbnailUrl aspectRatio shots")
    .sort({ createdAt: -1 })
    .lean();

  // Add shot count for display
  const result = styles.map((s) => ({
    ...s,
    _id: s._id.toString(),
    shotCount: s.shots?.length || 0,
    roomTypes: s.shots?.map((shot) => shot.roomType) || [],
  }));

  return NextResponse.json(result);
}
