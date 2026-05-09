export interface VideoInputConfig {
  endpoint: string;
  input: Record<string, any>;
}

/**
 * Builds the correct Fal API input payload based on the video model.
 * Each model has different field names, duration formats, and extra params.
 */
export function buildVideoInput(opts: {
  model: string;
  imageUrl: string;
  prompt: string;
  duration: number;
  aspectRatio: string;
  negativePrompt?: string;
}): VideoInputConfig {
  const { model, imageUrl, prompt, duration, aspectRatio } = opts;

  // Kling v3 Pro
  if (model.includes("kling-video")) {
    const endpoint = model.includes("image-to-video")
      ? model
      : `${model}/image-to-video`;
    return {
      endpoint,
      input: {
        prompt,
        start_image_url: imageUrl,
        duration: String(duration),
        negative_prompt:
          opts.negativePrompt || "blur, distort, and low quality",
        cfg_scale: 0.5,
      },
    };
  }

  // SeedDance (Bytedance)
  if (model.includes("seedance")) {
    return {
      endpoint: model,
      input: {
        image_url: imageUrl,
        prompt,
        duration: String(duration),
        aspect_ratio: aspectRatio,
        resolution: "720p",
      },
    };
  }

  // Veo 3 / 3.1 (Google)
  if (model.includes("veo3")) {
    return {
      endpoint: model,
      input: {
        image_url: imageUrl,
        prompt,
        duration: `${duration}s`,
        aspect_ratio: aspectRatio,
        resolution: "720p",
        negative_prompt: opts.negativePrompt || "",
        generate_audio: false,
      },
    };
  }

  // Wan Pro (Alibaba)
  if (model.includes("wan-pro")) {
    return {
      endpoint: model,
      input: {
        image_url: imageUrl,
        prompt,
      },
    };
  }

  // Luma Ray2
  if (model.includes("dream-machine-ray2") || model.includes("luma-ai")) {
    return {
      endpoint: model,
      input: {
        image_url: imageUrl,
        prompt,
        duration: `${duration}s`,
        aspect_ratio: aspectRatio,
        resolution: "540p",
      },
    };
  }

  // Fallback: generic model
  return {
    endpoint: model,
    input: {
      image_url: imageUrl,
      prompt,
      duration: String(duration),
      aspect_ratio: aspectRatio,
    },
  };
}
