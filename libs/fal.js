import { fal } from "@fal-ai/client";
import { buildVideoInput } from "./pipeline/build-video-input";

fal.config({
  credentials: process.env.FAL_KEY || process.env.FAL_API_KEY,
});

export async function submitImageTransform(imageUrl, prompt, model) {
  const result = await fal.queue.submit(model, {
    input: {
      image_urls: [imageUrl],
      prompt,
      num_images: 1,
      output_format: "jpeg",
    },
  });
  return { requestId: result.request_id, model };
}

export async function submitVideoGeneration(
  imageUrl,
  prompt,
  model,
  duration = 5,
  aspectRatio = "16:9"
) {
  const { endpoint, input } = buildVideoInput({
    model,
    imageUrl,
    prompt,
    duration,
    aspectRatio,
  });

  const result = await fal.queue.submit(endpoint, { input });
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
