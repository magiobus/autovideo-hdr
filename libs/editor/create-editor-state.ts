import {
  DEFAULT_TRANSITION_SECONDS,
  EDITOR_HEIGHT,
  EDITOR_VERSION,
  EDITOR_WIDTH,
  type EditorItem,
  type EditorState,
} from "./hyperframes-composition";

type EditStylePreset = {
  id: "architectural-luxe" | "editorial-listing" | "warm-lifestyle";
  transitionPrimary: "blur-crossfade" | "focus-pull" | "push-slide";
  transitionAccent: "color-dip-black" | "light-leak-soft" | "push-slide";
  transitionDuration: number;
  grainOpacity: number;
  lightLeak: boolean;
};

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
  voiceoverDuration,
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
  voiceoverDuration?: number | null;
  presenterVideoUrl?: string | null;
  musicUrl?: string | null;
  generationOptions?: any;
  appBaseUrl?: string;
  finalVideoUrl?: string;
  finalVideoKey?: string;
}): EditorState {
  const editStyle = resolveEditStyle(generationOptions);
  const transitionSeconds = editStyle.transitionDuration;
  const starts = getClipStarts(clipDurations, transitionSeconds);
  const duration = effectiveDuration(clipDurations, transitionSeconds);
  const dimensions = resolveEditorDimensions(generationOptions);
  const voiceoverTrackDuration = voiceoverUrl
    ? Math.min(
        duration,
        Math.max(0.1, Number(voiceoverDuration) || duration)
      )
    : 0;
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
        ? {
            type: transitionForCut(editStyle, index, clips.length),
            duration: transitionSeconds,
          }
        : undefined,
  }));

  const textItems: EditorItem[] = (editPlan.supportText || []).map((item, index) => ({
    id: `text-${item.clipIndex}`,
    kind: "text",
    clipIndex: item.clipIndex,
    text: item.headline,
    kicker: item.kicker || "",
    styleVariant: textStyleForOverlay({
      editStyle,
      item,
      index,
      clipCount: clips.length,
    }),
    fontSize: index === 0 ? 44 : 38,
    textColor: "#ffffff",
    kickerColor: editStyle.id === "warm-lifestyle" ? "#e7c9a5" : "#d8d3c8",
    accentColor: editStyle.id === "editorial-listing" ? "#d7c6a0" : "#ffffff",
    backgroundColor: editStyle.id === "warm-lifestyle"
      ? "rgba(24,18,13,.58)"
      : "rgba(8,9,10,.58)",
    position: item.position || "bottom-left",
    start: (starts[item.clipIndex] || 0) + 0.55,
    duration: Math.min(3.1, Math.max(1.8, (clipDurations[item.clipIndex] || 5) - 1)),
    trackIndex: 20 + item.clipIndex,
    transition: { type: "editorial-rise", duration: 0.45 },
  }));

  const voiceoverItems: EditorItem[] = [];
  if (voiceoverUrl) {
    voiceoverItems.push({
      id: "voiceover",
      kind: "audio",
      sourceUrl: voiceoverUrl,
      start: 0,
      duration: voiceoverTrackDuration,
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
      duration: voiceoverUrl ? voiceoverTrackDuration : Math.max(0.1, duration - 1.5),
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
    transitionSeconds,
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
      ...(voiceoverUrl && voiceoverDuration ? { voiceoverDuration } : {}),
      ...(presenterVideoUrl ? { presenterVideoUrl } : {}),
      ...(musicUrl ? { musicUrl } : {}),
    },
    editPlan,
    visualEffects: {
      grain: true,
      grainOpacity: editStyle.grainOpacity,
      lightLeak: editStyle.lightLeak,
      lightLeakOpacity: editStyle.id === "warm-lifestyle" ? 0.12 : 0.06,
      preset: editStyle.id,
    },
    ...(generationOptions ? { generationOptions } : {}),
  } as EditorState;
}

function resolveEditStyle(generationOptions?: any): EditStylePreset {
  const preset = String(
    generationOptions?.editStyle?.presetId ||
      generationOptions?.editStyle ||
      "architectural-luxe"
  );

  if (preset === "editorial-listing") {
    return {
      id: "editorial-listing",
      transitionPrimary: "push-slide",
      transitionAccent: "color-dip-black",
      transitionDuration: 0.5,
      grainOpacity: 0.07,
      lightLeak: false,
    };
  }

  if (preset === "warm-lifestyle") {
    return {
      id: "warm-lifestyle",
      transitionPrimary: "focus-pull",
      transitionAccent: "light-leak-soft",
      transitionDuration: 0.7,
      grainOpacity: 0.1,
      lightLeak: true,
    };
  }

  return {
    id: "architectural-luxe",
    transitionPrimary: "blur-crossfade",
    transitionAccent: "color-dip-black",
    transitionDuration: 0.65,
    grainOpacity: 0.08,
    lightLeak: false,
  };
}

function transitionForCut(
  editStyle: EditStylePreset,
  cutIndex: number,
  clipCount: number
): NonNullable<EditorItem["transition"]>["type"] {
  const isClosingCut = cutIndex >= clipCount - 2;
  const isMiddleSection = cutIndex === 2 || cutIndex === 5;

  if (isClosingCut) return "color-dip-black";
  if (editStyle.id === "warm-lifestyle" && cutIndex === 0) return "light-leak-soft";
  if (editStyle.id === "editorial-listing" && isMiddleSection) return "color-dip-black";
  if (isMiddleSection) return editStyle.transitionAccent;
  return editStyle.transitionPrimary;
}

function textStyleForOverlay({
  editStyle,
  item,
  index,
  clipCount,
}: {
  editStyle: EditStylePreset;
  item: NonNullable<EditPlan["supportText"]>[number];
  index: number;
  clipCount: number;
}): EditorItem["styleVariant"] {
  const text = `${item.headline || ""} ${item.kicker || ""}`;
  if (index === 0) return "estate-title";
  if (item.clipIndex >= clipCount - 1 || /\$|price|offered|available/i.test(text)) {
    return "estate-price";
  }
  if (editStyle.id === "editorial-listing") return "estate-spec";
  return "estate-lower";
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
