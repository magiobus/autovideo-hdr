import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { createPresignedUploadUrl } from "@/libs/r2";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_FILES = 20;

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { files } = await request.json();

  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Send between 1 and ${MAX_FILES} files` },
      { status: 400 }
    );
  }

  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.contentType)) {
      return NextResponse.json(
        { error: `Invalid file type: ${file.contentType}` },
        { status: 400 }
      );
    }
  }

  const userId = session.user.id;
  const timestamp = Date.now();

  const urls = await Promise.all(
    files.map((file, index) => {
      const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `uploads/${userId}/${timestamp}-${index}-${safeName}`;
      return createPresignedUploadUrl(key, file.contentType);
    })
  );

  return NextResponse.json({ urls });
}
