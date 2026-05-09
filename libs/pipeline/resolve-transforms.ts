export interface TransformPass {
  order: number;
  prompt: string;
  model: string;
}

/**
 * Normalizes a shot's image transform config into an ordered array of passes.
 * Supports both new multi-pass (imageTransforms[]) and legacy single-pass (imagePrompt).
 */
export function resolveTransforms(shot: any): TransformPass[] {
  if (shot.imageTransforms?.length > 0) {
    return [...shot.imageTransforms]
      .sort((a: any, b: any) => a.order - b.order)
      .map((t: any) => ({
        order: t.order,
        prompt: t.prompt,
        model: t.model || "fal-ai/nano-banana/edit",
      }));
  }

  if (shot.imagePrompt) {
    return [
      {
        order: 0,
        prompt: shot.imagePrompt,
        model: shot.imageModel || "fal-ai/nano-banana/edit",
      },
    ];
  }

  return [];
}
