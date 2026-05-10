export const EDITOR_VERSION = 1;
export const EDITOR_WIDTH = 1920;
export const EDITOR_HEIGHT = 1080;
export const DEFAULT_TRANSITION_SECONDS = 0.45;

export type EditorTrackType = "video" | "text" | "overlay" | "audio";

export type EditorTrack = {
  id: string;
  type: EditorTrackType;
  label: string;
  items: EditorItem[];
};

export type EditorItem = {
  id: string;
  kind: "video" | "text" | "bubble" | "audio";
  clipIndex?: number;
  sourceUrl?: string;
  text?: string;
  kicker?: string;
  position?: "bottom-left" | "bottom-center" | "top-left";
  start: number;
  duration: number;
  trimStart?: number;
  volume?: number;
  trackIndex?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  shape?: "circle" | "rounded";
  transition?: {
    type: "crossfade";
    duration: number;
  };
};

export type EditorState = {
  version: number;
  width: number;
  height: number;
  fps: number;
  duration: number;
  transitionSeconds: number;
  tracks: EditorTrack[];
  render: {
    status: "draft" | "dirty" | "rendering" | "rendered" | "failed";
    finalVideoUrl?: string;
    finalVideoKey?: string;
    error?: string;
    renderedAt?: string;
  };
  artifacts?: Record<string, string>;
  editPlan?: any;
};

export function buildHyperframesComposition(
  editorState: EditorState,
  options: { includePreviewRuntime?: boolean } = {}
) {
  const width = editorState.width || EDITOR_WIDTH;
  const height = editorState.height || EDITOR_HEIGHT;
  const duration = Math.max(0.1, editorState.duration || 0.1);
  const body = editorState.tracks
    .flatMap((track) =>
      (track.items || []).map((item, index) =>
        renderItem(item, item.trackIndex ?? trackIndex(track.type, index))
      )
    )
    .join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { margin: 0; width: 100%; height: 100%; background: #000; font-family: Helvetica, Arial, sans-serif; }
    body.is-preview { overflow: hidden; display: flex; align-items: center; justify-content: center; }
    #hf-stage { width: ${width}px; height: ${height}px; transform-origin: center center; }
    [data-composition-id] { position: relative; overflow: hidden; width: ${width}px; height: ${height}px; background: #000; color: #fff; }
    .clip { position: absolute; }
    video.clip { inset: 0; width: 100%; height: 100%; object-fit: cover; }
    audio.clip { width: 0; height: 0; opacity: 0; pointer-events: none; }
    .support { z-index: 40; max-width: 760px; color: white; letter-spacing: 0; text-shadow: 0 18px 44px rgba(0,0,0,.45); }
    .support h1 { margin: 0; font-size: 58px; font-weight: 500; line-height: 1.02; }
    .support span { display: block; margin-bottom: 14px; font-size: 24px; color: rgba(255,255,255,.72); }
    .bubble { z-index: 35; overflow: hidden; border: 6px solid rgba(255,255,255,.88); box-shadow: 0 22px 60px rgba(0,0,0,.34); background: rgba(255,255,255,.08); }
    .bubble.circle { border-radius: 9999px; }
    .bubble.rounded { border-radius: 34px; }
    .bubble img, .bubble video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .bottom-left { left: 86px; bottom: 86px; }
    .bottom-center { left: 50%; bottom: 86px; transform: translateX(-50%); text-align: center; }
    .top-left { left: 86px; top: 86px; }
  </style>
</head>
<body class="${options.includePreviewRuntime ? "is-preview" : ""}">
<div id="hf-stage">
<div data-composition-id="autohdr-video-studio" data-start="0" data-duration="${duration.toFixed(2)}" data-width="${width}" data-height="${height}">
${body}
</div>
</div>
${options.includePreviewRuntime ? buildPreviewRuntime(duration) : ""}
</body>
</html>`;
}

function renderItem(item: EditorItem, track: number) {
  const start = numberAttr(item.start);
  const duration = numberAttr(Math.max(0.1, item.duration));
  const attrs = `data-start="${start}" data-duration="${duration}" data-trim-start="${numberAttr(item.trimStart ?? 0)}" data-track-index="${track}"`;

  if (item.kind === "video") {
    return `<video class="clip" ${attrs} src="${escapeHtml(item.sourceUrl || "")}" muted playsinline preload="auto"></video>`;
  }
  if (item.kind === "audio") {
    return `<audio class="clip" ${attrs} src="${escapeHtml(item.sourceUrl || "")}" data-volume="${numberAttr(item.volume ?? 1)}"></audio>`;
  }
  if (item.kind === "bubble") {
    const style = `left:${numberAttr(item.x ?? 1280)}px;top:${numberAttr(item.y ?? 560)}px;width:${numberAttr(item.width ?? 320)}px;height:${numberAttr(item.height ?? 320)}px;`;
    const media = isVideoUrl(item.sourceUrl || "")
      ? `<video src="${escapeHtml(item.sourceUrl || "")}" muted playsinline preload="auto"></video>`
      : `<img src="${escapeHtml(item.sourceUrl || "")}" alt="" />`;
    return `<div class="clip bubble ${item.shape || "circle"}" ${attrs} style="${style}">${media}</div>`;
  }

  return `<div class="clip support ${item.position || "bottom-left"}" ${attrs}>
  ${item.kicker ? `<span>${escapeHtml(item.kicker)}</span>` : ""}
  <h1>${escapeHtml(item.text || "")}</h1>
</div>`;
}

function trackIndex(type: EditorTrackType, index: number) {
  if (type === "video") return index % 2;
  if (type === "text") return 20 + index;
  if (type === "overlay") return 35 + index;
  return 50 + index;
}

function isVideoUrl(value: string) {
  return /\.(mp4|mov|webm)(\?|#|$)/i.test(value);
}

function numberAttr(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPreviewRuntime(duration: number) {
  return `<script>
(() => {
  const duration = ${duration.toFixed(3)};
  const stage = document.getElementById('hf-stage');
  const composition = document.querySelector('[data-composition-id]');
  const clips = Array.from(document.querySelectorAll('.clip')).map((el) => ({
    el,
    start: Number(el.dataset.start || 0),
    duration: Number(el.dataset.duration || duration),
    trimStart: Number(el.dataset.trimStart || 0),
  }));
  let currentTime = 0;
  let playing = false;
  let lastTick = performance.now();
  let raf = 0;

  function localTime(clip) {
    return Math.max(0, Math.min(clip.duration, currentTime - clip.start)) + Math.max(0, clip.trimStart || 0);
  }

  function fitStage() {
    if (!stage) return;
    const width = Number(composition?.dataset.width || ${EDITOR_WIDTH});
    const height = Number(composition?.dataset.height || ${EDITOR_HEIGHT});
    const scale = Math.min(window.innerWidth / width, window.innerHeight / height);
    stage.style.transform = 'scale(' + Math.max(0.01, scale) + ')';
  }

  function syncMediaElement(media, clip) {
    const local = localTime(clip);
    const volume = Number(clip.el.dataset.volume);
    if (Number.isFinite(volume)) media.volume = Math.max(0, Math.min(1, volume));
    if (Number.isFinite(local) && Math.abs((media.currentTime || 0) - local) > 0.08) {
      media.currentTime = local;
    }
    if (playing && isActive(clip)) {
      media.play().catch(() => {});
    } else {
      media.pause();
    }
  }

  function syncMedia(clip) {
    const media = clip.el instanceof HTMLVideoElement || clip.el instanceof HTMLAudioElement
      ? [clip.el]
      : Array.from(clip.el.querySelectorAll('video, audio'));
    for (const item of media) syncMediaElement(item, clip);
  }

  function isActive(clip) {
    return currentTime >= clip.start && currentTime < clip.start + clip.duration;
  }

  function render() {
    for (const clip of clips) {
      clip.el.style.display = isActive(clip) ? '' : 'none';
      syncMedia(clip);
    }
    window.parent?.postMessage({
      type: 'autohdr-preview-time',
      time: currentTime,
      duration,
      playing,
    }, '*');
  }

  function tick(now) {
    if (playing) {
      currentTime = Math.min(duration, currentTime + (now - lastTick) / 1000);
      if (currentTime >= duration) playing = false;
      render();
    }
    lastTick = now;
    raf = requestAnimationFrame(tick);
  }

  function setTime(time) {
    currentTime = Math.max(0, Math.min(duration, Number(time) || 0));
    render();
  }

  window.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type !== 'autohdr-preview') return;
    if (data.action === 'play') playing = true;
    if (data.action === 'pause') playing = false;
    if (data.action === 'stop') {
      playing = false;
      currentTime = 0;
    }
    if (data.action === 'seek') setTime(data.time);
    lastTick = performance.now();
    render();
  });

  fitStage();
  render();
  raf = requestAnimationFrame(tick);
  window.addEventListener('resize', fitStage);
  window.addEventListener('beforeunload', () => cancelAnimationFrame(raf));
})();
</script>`;
}
