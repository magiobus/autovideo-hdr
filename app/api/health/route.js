import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";

export async function GET() {
  try {
    await connectMongo();
    return NextResponse.json({ status: "connected", db: "ok" });
  } catch (error) {
    return NextResponse.json(
      { status: "error", db: error.message },
      { status: 500 }
    );
  }
}
