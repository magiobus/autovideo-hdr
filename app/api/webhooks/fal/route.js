import { NextResponse } from "next/server";

/**
 * Legacy Fal webhook endpoint.
 *
 * Trigger.dev is the only active orchestrator for the video pipeline. It
 * submits, polls, stores results, and assembles the final video, so Fal
 * callbacks must not mutate project state from this Next.js route.
 */
export async function POST() {
  return NextResponse.json({ ok: true, ignored: true });
}
