import {
  DEFAULT_TRANSITION_SECONDS,
  EDITOR_HEIGHT,
  EDITOR_VERSION,
  EDITOR_WIDTH,
  type EditorItem,
  type EditorState,
} from "./hyperframes-composition";

type EditPlan = {
  voiceover?: string;
  supportText?: Array<{
    clipIndex: number;
    headline: string;
    kicker?: string;
    position?: "bottom-left" | "bottom-center" | "top-left";
  }>;
};

export function createEditorState({
  clips,
  clipDurations,
  editPlan,
  voiceoverUrl,
  presenterVideoUrl,
  musicUrl,
  generationOptions,
  appBaseUrl,
  finalVideoUrl,
  finalVideoKey,
}: {
  clips: Array<{ videoUrl: string; shotIndex?: number }>;
  clipDurations: number[];
  editPlan: EditPlan;
  voiceoverUrl?: string | null;
  presenterVideoUrl?: string | null;
  musicUrl?: string | null;
  generationOptions?: any;
  appBaseUrl?: string;
  finalVideoUrl?: string;
  finalVideoKey?: string;
}): EditorState {
  const starts = getClipStarts(clipDurations, DEFAULT_TRANSITION_SECONDS);
  const duration = effectiveDuration(clipDurations, DEFAULT_TRANSITION_SECONDS);
  const dimensions = resolveEditorDimensions(generationOptions);
  const videoItems: EditorItem[] = clips.map((clip, index) => ({
    id: `clip-${index}`,
    kind: "video",
    clipIndex: index,
    sourceUrl: clip.videoUrl,
    start: starts[index] || 0,
    duration: clipDurations[index] || 5,
    trimStart: 0,
    fit: "contain",
    trackIndex: index % 2,
    transition:
      index < clips.length - 1
        ? { type: "crossfade", duration: DEFAULT_TRANSITION_SECONDS }
        : undefined,
  }));

  const textItems: EditorItem[] = (editPlan.supportText || []).map((item, index) => ({
    id: `text-${item.clipIndex}`,
    kind: "text",
    clipIndex: item.clipIndex,
    text: item.headline,
    kicker: item.kicker || "",
    styleVariant: index === 0 ? "lower-third" : index % 2 === 0 ? "signal" : "glass-card",
    fontSize: index === 0 ? 50 : 44,
    textColor: "#ffffff",
    kickerColor: "#d8b4fe",
    accentColor: "#c084fc",
    backgroundColor: "rgba(10,12,16,.62)",
    position: item.position || "bottom-left",
    start: (starts[item.clipIndex] || 0) + 0.45,
    duration: Math.min(3.1, Math.max(1.8, (clipDurations[item.clipIndex] || 5) - 1)),
    trackIndex: 20 + item.clipIndex,
    transition: { type: "slide-up", duration: 0.35 },
  }));

  const voiceoverItems: EditorItem[] = [];
  if (voiceoverUrl) {
    voiceoverItems.push({
      id: "voiceover",
      kind: "audio",
      sourceUrl: voiceoverUrl,
      start: 0,
      duration,
      volume: 1,
      trackIndex: 50,
    });
  }
  const musicItems: EditorItem[] = [];
  if (musicUrl) {
    musicItems.push({
      id: "music",
      kind: "audio",
      sourceUrl: musicUrl,
      start: 0,
      duration,
      volume: voiceoverUrl ? 0.2 : 0.35,
      trackIndex: 51,
    });
  }

  const overlayItems: EditorItem[] = [];
  if (generationOptions?.presenter?.enabled) {
    const presenterUrl =
      presenterVideoUrl ||
      resolvePresenterUrl(generationOptions.presenter.presenterId, appBaseUrl);
    overlayItems.push({
      id: "presenter-bubble",
      kind: "bubble",
      sourceUrl: presenterUrl,
      start: voiceoverUrl ? 0 : 0.75,
      duration: voiceoverUrl ? duration : Math.max(0.1, duration - 1.5),
      trimStart: 0,
      trackIndex: 35,
      x: dimensions.width > dimensions.height ? 1260 : 560,
      y: dimensions.width > dimensions.height ? 610 : 1360,
      width: 360,
      height: 360,
      shape: "circle",
    });
  }

  return {
    version: EDITOR_VERSION,
    width: dimensions.width,
    height: dimensions.height,
    fps: 30,
    duration,
    transitionSeconds: DEFAULT_TRANSITION_SECONDS,
    tracks: [
      { id: "video", type: "video", label: "Video", items: videoItems },
      { id: "overlay", type: "overlay", label: "Overlays", items: overlayItems },
      { id: "text", type: "text", label: "Text", items: textItems },
      { id: "voiceover", type: "audio", label: "Voice", items: voiceoverItems },
      { id: "music", type: "audio", label: "Music", items: musicItems },
    ],
    render: {
      status: finalVideoUrl ? "rendered" : "draft",
      finalVideoUrl,
      finalVideoKey,
    },
    artifacts: {
      ...(voiceoverUrl ? { voiceoverUrl } : {}),
      ...(presenterVideoUrl ? { presenterVideoUrl } : {}),
      ...(musicUrl ? { musicUrl } : {}),
    },
    editPlan,
    visualEffects: {
      grain: true,
      lightLeak: true,
    },
    ...(generationOptions ? { generationOptions } : {}),
  } as EditorState;
}

function resolveEditorDimensions(generationOptions?: any) {
  const aspectRatio = generationOptions?.format?.aspectRatio;
  if (aspectRatio === "9:16") {
    return { width: EDITOR_HEIGHT, height: EDITOR_WIDTH };
  }
  return { width: EDITOR_WIDTH, height: EDITOR_HEIGHT };
}

function resolvePresenterUrl(presenterId?: string, appBaseUrl?: string) {
  const id = presenterId || "male-1";
  const path = `/samples/presenters/${id}.jpg`;
  if (!appBaseUrl) return path;
  return `${appBaseUrl.replace(/\/$/, "")}${path}`;
}

export function recomputeEditorTiming(editorState: EditorState) {
  const videoTrack = editorState.tracks.find((track) => track.id === "video");
  if (!videoTrack) return editorState;
  let start = 0;
  const transition = editorState.transitionSeconds || DEFAULT_TRANSITION_SECONDS;
  const nextItems = videoTrack.items.map((item, index) => {
    const next = { ...item, start };
    start += Math.max(0.1, item.duration || 0.1);
    if (index < videoTrack.items.length - 1) start -= transition;
    return next;
  });
  const duration = Math.max(0.1, start);
  return {
    ...editorState,
    duration,
    tracks: editorState.tracks.map((track) =>
      track.id === "video" ? { ...track, items: nextItems } : track
    ),
  };
}

function getClipStarts(durations: number[], transition: number) {
  const starts: number[] = [];
  let elapsed = 0;
  for (let i = 0; i < durations.length; i++) {
    starts.push(Math.max(0, elapsed - transition * i));
    elapsed += durations[i];
  }
  return starts;
}

function effectiveDuration(durations: number[], transition: number) {
  return (
    durations.reduce((sum, duration) => sum + duration, 0) -
    transition * Math.max(0, durations.length - 1)
  );
}
