import apiClient from "@/libs/api";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function uploadFilesToR2(files) {
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`${file.name} exceeds 10MB limit`);
    }
  }

  const filesMeta = files.map((file) => ({
    filename: file.name,
    contentType: file.type,
  }));

  const { urls } = await apiClient.post("/upload/presigned", {
    files: filesMeta,
  });

  const results = await Promise.all(
    urls.map(async (urlData, index) => {
      const response = await fetch(urlData.signedUrl, {
        method: "PUT",
        body: files[index],
        headers: { "Content-Type": files[index].type },
      });

      if (!response.ok) {
        throw new Error(`Failed to upload ${files[index].name}`);
      }

      return {
        key: urlData.key,
        publicUrl: urlData.publicUrl,
        filename: files[index].name,
      };
    })
  );

  return results;
}
