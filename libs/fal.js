import { fal } from "@fal-ai/client";

fal.config({
  credentials: process.env.FAL_KEY || process.env.FAL_API_KEY,
});

function getWebhookUrl() {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";
  return `${base}/api/webhooks/fal`;
}

export async function submitImageTransform(imageUrl, prompt, model, webhookUrl) {
  const result = await fal.queue.submit(model, {
    input: {
      image_urls: [imageUrl],
      prompt,
      num_images: 1,
      output_format: "jpeg",
    },
    webhookUrl: webhookUrl || getWebhookUrl(),
  });
  return { requestId: result.request_id, model };
}

export async function submitVideoGeneration(
  imageUrl,
  prompt,
  model,
  duration = 5,
  aspectRatio = "16:9",
  webhookUrl
) {
  // Kling v3 models need /image-to-video suffix and use start_image_url
  const isKling = model.includes("kling-video");
  const endpoint =
    isKling && !model.includes("image-to-video")
      ? `${model}/image-to-video`
      : model;

  const input = isKling
    ? {
        prompt,
        start_image_url: imageUrl,
        duration: String(duration),
        negative_prompt: "blur, distort, and low quality",
        cfg_scale: 0.5,
      }
    : {
        prompt,
        image_url: imageUrl,
        duration: String(duration),
        aspect_ratio: aspectRatio,
      };

  const result = await fal.queue.submit(endpoint, {
    input,
    webhookUrl: webhookUrl || getWebhookUrl(),
  });
  return { requestId: result.request_id, model: endpoint };
}

export async function checkJob(model, requestId) {
  const status = await fal.queue.status(model, {
    requestId,
    logs: false,
  });
  return status;
}

export async function getJobResult(model, requestId) {
  const result = await fal.queue.result(model, { requestId });
  return result;
}

export { fal };
