import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Downloads a file from a URL and uploads it to R2.
 * Returns the public URL.
 */
export async function downloadAndStoreToR2(sourceUrl, key, contentType) {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  await r2Client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  return publicUrl;
}
