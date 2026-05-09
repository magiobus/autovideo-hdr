import { z } from "zod";
import OpenAI from "openai";
import { fal } from "@fal-ai/client";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import mongoose from "mongoose";

// ─── Constants ───────────────────────────────────────────────────────
export const ROOM_TYPES = [
  "exterior_front",
  "exterior_back",
  "living_room",
  "kitchen",
  "bedroom",
  "bathroom",
  "dining",
  "pool",
  "detail",
  "aerial",
  "garage",
  "office",
  "hallway",
  "patio",
];

export const POLL_INTERVAL_MS = 10_000;
export const MAX_POLL_ATTEMPTS = 120;

// ─── Shared step schema ─────────────────────────────────────────────
export const stepIO = {
  inputSchema: z.object({ projectId: z.string() }),
  outputSchema: z.object({ projectId: z.string() }),
};

// ─── SDK helpers ────────────────────────────────────────────────────
export function getR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export function configureFal() {
  fal.config({
    credentials: process.env.FAL_KEY || process.env.FAL_API_KEY,
  });
}

export async function connectDB() {
  if (mongoose.connection.readyState >= 1) return;
  await mongoose.connect(process.env.MONGODB_URI!);
}

export async function getModels() {
  const ProjectMod = await import("@/models/Project");
  const StyleMod = await import("@/models/Style");
  return { Project: ProjectMod.default, Style: StyleMod.default };
}

// ─── R2 operations ──────────────────────────────────────────────────
export async function downloadImageFromR2(key: string): Promise<string> {
  const r2 = getR2Client();
  const result = await r2.send(
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key })
  );
  const chunks: Uint8Array[] = [];
  for await (const chunk of result.Body as any) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("base64");
}

export async function createPresignedDownloadUrl(
  key: string
): Promise<string> {
  const r2 = getR2Client();
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }),
    { expiresIn: 3600 }
  );
}

export async function downloadAndStoreToR2(
  sourceUrl: string,
  key: string,
  contentType: string
): Promise<string> {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  const r2 = getR2Client();
  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return `${process.env.R2_PUBLIC_URL!.replace(/\/$/, "")}/${key}`;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Re-export fal for steps that need it
export { fal };
