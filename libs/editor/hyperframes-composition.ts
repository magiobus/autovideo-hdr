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
  styleVariant?: "lower-third" | "glass-card" | "headline" | "signal";
  fontSize?: number;
  textColor?: string;
  kickerColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  position?: "bottom-left" | "bottom-center" | "top-left";
  start: number;
  duration: number;
  trimStart?: number;
  volume?: number;
  trackIndex?: number;
  fit?: "contain" | "cover";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  shape?: "circle" | "rounded";
  transition?: {
    type: "none" | "crossfade" | "fade" | "slide-up" | "zoom";
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
  visualEffects?: {
    grain?: boolean;
    lightLeak?: boolean;
  };
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
  const effects = editorState.visualEffects || { grain: true, lightLeak: true };
  const timelineScript = buildAnimationTimeline(editorState);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { margin: 0; width: 100%; height: 100%; background: #000; font-family: Helvetica, Arial, sans-serif; }
    body.is-preview { overflow: hidden; position: relative; display: block; }
    #hf-stage { width: ${width}px; height: ${height}px; transform-origin: center center; }
    body.is-preview #hf-stage { position: absolute; left: 50%; top: 50%; }
    [data-composition-id] { position: relative; overflow: hidden; width: ${width}px; height: ${height}px; background: #000; color: #fff; }
    .clip { position: absolute; }
    video.clip { inset: 0; width: 100%; height: 100%; object-fit: var(--media-fit, contain); background: #000; }
    audio.clip { width: 0; height: 0; opacity: 0; pointer-events: none; }
    .support { z-index: 40; box-sizing: border-box; max-width: 760px; min-width: 360px; color: var(--text-color, #fff); letter-spacing: 0; text-shadow: 0 18px 44px rgba(0,0,0,.45); }
    .support h1 { margin: 0; color: var(--text-color, #fff); font-size: var(--font-size, 48px); font-weight: 650; line-height: 1.02; }
    .support span { display: block; margin-bottom: 12px; font-size: 18px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: var(--kicker-color, rgba(255,255,255,.62)); }
    .support.variant-lower-third, .support.variant-glass-card, .support.variant-signal {
      padding: 26px 30px 28px;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 24px;
      background: var(--panel-bg, linear-gradient(135deg, rgba(16,18,22,.74), rgba(16,18,22,.36)));
      box-shadow: 0 28px 80px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.18);
      backdrop-filter: blur(18px);
      text-shadow: none;
      overflow: hidden;
    }
    .support.variant-lower-third::before {
      content: "";
      position: absolute;
      left: 20px;
      top: 22px;
      bottom: 22px;
      width: 5px;
      border-radius: 999px;
      background: var(--accent-color, #c084fc);
      box-shadow: 0 0 28px rgba(192,132,252,.55);
    }
    .support.variant-lower-third { padding-left: 46px; }
    .support.variant-glass-card { max-width: 560px; }
    .support.variant-signal { max-width: 520px; padding-top: 22px; }
    .support.variant-signal::after {
      content: "";
      display: block;
      margin-top: 18px;
      width: 74%;
      height: 3px;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--accent-color, #5eead4), transparent);
    }
    .support.variant-headline { max-width: 980px; min-width: 0; background: transparent; }
    .support.variant-headline h1 { font-size: var(--font-size, 86px); font-weight: 800; letter-spacing: 0; text-transform: uppercase; }
    .bubble { z-index: 35; overflow: hidden; border: 6px solid rgba(255,255,255,.88); box-shadow: 0 22px 60px rgba(0,0,0,.34); background: rgba(255,255,255,.08); }
    .bubble.circle { border-radius: 9999px; }
    .bubble.rounded { border-radius: 34px; }
    .bubble img, .bubble video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .bubble.static-avatar img { animation: presenter-idle 3.2s ease-in-out infinite; transform-origin: 50% 55%; }
    @keyframes presenter-idle {
      0%, 100% { transform: scale(1) translateY(0); }
      45% { transform: scale(1.035) translateY(-1.5%); }
      70% { transform: scale(1.015) translateY(.8%); }
    }
    .bottom-left { left: 86px; bottom: 86px; }
    .bottom-center { left: 50%; bottom: 86px; transform: translateX(-50%); text-align: center; }
    .top-left { left: 86px; top: 86px; }
    body.is-preview .bubble, body.is-preview .support { cursor: move; }
    body.is-preview .hf-selected { outline: 4px solid #4f8cff; outline-offset: 0; overflow: visible !important; }
    .hf-resize-handle { position: absolute; z-index: 2000; width: 46px; height: 46px; border: 6px solid #4f8cff; background: #fff; box-sizing: border-box; pointer-events: auto; touch-action: none; }
    .hf-resize-handle.nw { left: -23px; top: -23px; cursor: nwse-resize; }
    .hf-resize-handle.ne { right: -23px; top: -23px; cursor: nesw-resize; }
    .hf-resize-handle.sw { left: -23px; bottom: -23px; cursor: nesw-resize; }
    .hf-resize-handle.se { right: -23px; bottom: -23px; cursor: nwse-resize; }
    .grain-overlay { position: absolute; inset: -20%; z-index: 80; pointer-events: none; opacity: .12; mix-blend-mode: overlay; background-image: radial-gradient(circle at 20% 30%, rgba(255,255,255,.85) 0 1px, transparent 1px), radial-gradient(circle at 70% 40%, rgba(255,255,255,.55) 0 1px, transparent 1px), radial-gradient(circle at 40% 80%, rgba(0,0,0,.55) 0 1px, transparent 1px); background-size: 9px 9px, 13px 13px, 17px 17px; animation: grain-shift .9s steps(5) infinite; }
    .light-leak-overlay { position: absolute; inset: 0; z-index: 78; pointer-events: none; opacity: 0; mix-blend-mode: screen; background: radial-gradient(circle at 8% 40%, rgba(255,196,128,.58), transparent 32%), radial-gradient(circle at 100% 18%, rgba(125,211,252,.24), transparent 28%); animation: light-leak 7.5s ease-in-out infinite; }
    @keyframes grain-shift {
      0% { transform: translate3d(0,0,0); }
      25% { transform: translate3d(-2%,1%,0); }
      50% { transform: translate3d(1%,-2%,0); }
      75% { transform: translate3d(2%,2%,0); }
      100% { transform: translate3d(-1%,0,0); }
    }
    @keyframes light-leak {
      0%, 70%, 100% { opacity: 0; transform: translateX(-10%); }
      10% { opacity: .18; transform: translateX(0); }
      26% { opacity: .06; transform: translateX(8%); }
    }
  </style>
</head>
<body class="${options.includePreviewRuntime ? "is-preview" : ""}">
<div id="hf-stage">
<div data-composition-id="autohdr-video-studio" data-start="0" data-duration="${duration.toFixed(2)}" data-width="${width}" data-height="${height}">
${body}
${effects.grain ? `<div class="grain-overlay"></div>` : ""}
${effects.lightLeak ? `<div class="light-leak-overlay"></div>` : ""}
</div>
</div>
${timelineScript}
${options.includePreviewRuntime ? buildPreviewRuntime(duration) : ""}
</body>
</html>`;
}

function renderItem(item: EditorItem, track: number) {
  const start = numberAttr(item.start);
  const duration = numberAttr(Math.max(0.1, item.duration));
  const transition = item.transition?.type || "none";
  const transitionDuration = item.transition?.duration ?? 0;
  const attrs = `data-item-id="${escapeHtml(item.id)}" data-kind="${item.kind}" data-start="${start}" data-duration="${duration}" data-trim-start="${numberAttr(item.trimStart ?? 0)}" data-track-index="${track}" data-transition-type="${escapeHtml(transition)}" data-transition-duration="${numberAttr(transitionDuration)}"`;

  if (item.kind === "video") {
    const fit = item.fit === "cover" ? "cover" : "contain";
    return `<video class="clip" ${attrs} src="${escapeHtml(item.sourceUrl || "")}" muted playsinline preload="auto" style="--media-fit:${fit};"></video>`;
  }
  if (item.kind === "audio") {
    return `<audio class="clip" ${attrs} src="${escapeHtml(item.sourceUrl || "")}" data-volume="${numberAttr(item.volume ?? 1)}"></audio>`;
  }
  if (item.kind === "bubble") {
    const style = `left:${numberAttr(item.x ?? 1280)}px;top:${numberAttr(item.y ?? 560)}px;width:${numberAttr(item.width ?? 320)}px;height:${numberAttr(item.height ?? 320)}px;`;
    const media = isVideoUrl(item.sourceUrl || "")
      ? `<video src="${escapeHtml(item.sourceUrl || "")}" muted playsinline preload="auto"></video>`
      : `<img src="${escapeHtml(item.sourceUrl || "")}" alt="" />`;
    const motionClass = isVideoUrl(item.sourceUrl || "") ? "" : " static-avatar";
    return `<div class="clip bubble ${item.shape || "circle"}${motionClass}" ${attrs} style="${style}">${media}</div>`;
  }

  const hasCustomTextBox = Number.isFinite(item.x) || Number.isFinite(item.y);
  const defaultFontSize = item.styleVariant === "headline" ? 86 : 48;
  const textStyle = [
    hasCustomTextBox ? `left:${numberAttr(item.x ?? 86)}px;top:${numberAttr(item.y ?? 770)}px;` : "",
    item.width ? `width:${numberAttr(item.width)}px;` : "",
    item.height ? `height:${numberAttr(item.height)}px;` : "",
    `--font-size:${numberAttr(item.fontSize ?? defaultFontSize)}px;`,
    `--text-color:${cssValue(item.textColor, "#ffffff")};`,
    `--kicker-color:${cssValue(item.kickerColor, "rgba(255,255,255,.62)")};`,
    `--accent-color:${cssValue(item.accentColor, "#c084fc")};`,
    `--panel-bg:${cssValue(item.backgroundColor, "linear-gradient(135deg, rgba(16,18,22,.74), rgba(16,18,22,.36))")};`,
  ].join("");
  const positionClass = hasCustomTextBox ? "" : item.position || "bottom-left";
  return `<div class="clip support variant-${item.styleVariant || "lower-third"} ${positionClass}" ${attrs}${textStyle ? ` style="${textStyle}"` : ""}>
  ${item.kicker ? `<span>${escapeHtml(item.kicker)}</span>` : ""}
  <h1>${escapeHtml(item.text || "")}</h1>
</div>`;
}

function buildAnimationTimeline(editorState: EditorState) {
  const items = editorState.tracks.flatMap((track) => track.items || []);
  const animated = items.filter(
    (item) => item.kind !== "audio" && item.transition?.type && item.transition.type !== "none"
  );
  if (animated.length === 0) return "";

  const timelineItems = animated.map((item) => ({
    id: item.id,
    kind: item.kind,
    start: item.start,
    duration: Math.max(0.1, item.duration),
    type: item.transition?.type || "fade",
    transitionDuration: Math.min(
      Math.max(0.1, item.transition?.duration || 0.45),
      Math.max(0.1, item.duration / 2)
    ),
  }));

  return `<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
<script>
(() => {
  const items = ${JSON.stringify(timelineItems)};
  if (!window.gsap) return;
  const tl = gsap.timeline({ paused: true });
  for (const item of items) {
    const el = document.querySelector('[data-item-id="' + CSS.escape(item.id) + '"]');
    if (!el) continue;
    const end = item.start + item.duration;
    const d = Math.max(0.1, Math.min(item.transitionDuration, item.duration / 2));
    tl.set(el, { opacity: 0, visibility: 'hidden' }, 0);
    tl.set(el, { visibility: 'visible' }, item.start);
    if (item.type === 'slide-up') {
      tl.fromTo(el, { opacity: 0, y: 48 }, { opacity: 1, y: 0, duration: d, ease: 'power2.out' }, item.start);
    } else if (item.type === 'zoom') {
      tl.fromTo(el, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: d, ease: 'power2.out' }, item.start);
    } else {
      tl.to(el, { opacity: 1, duration: d, ease: 'power1.out' }, item.start);
    }
    tl.to(el, { opacity: 0, duration: d, ease: 'power1.in' }, Math.max(item.start, end - d));
    tl.set(el, { visibility: 'hidden' }, end);
  }
  window.__timelines = window.__timelines || {};
  window.__timelines['autohdr-video-studio'] = tl;
})();
</script>`;
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

function cssValue(value: string | undefined, fallback: string) {
  const raw = String(value || "").trim();
  if (!raw || /[;{}<>]/.test(raw)) return fallback;
  return raw.replace(/"/g, "");
}

function buildPreviewRuntime(duration: number) {
  return `<script>
(() => {
  const duration = ${duration.toFixed(3)};
  const stage = document.getElementById('hf-stage');
  const composition = document.querySelector('[data-composition-id]');
  const clips = Array.from(document.querySelectorAll('.clip')).map((el) => ({
    el,
    itemId: el.dataset.itemId || '',
    kind: el.dataset.kind || '',
    start: Number(el.dataset.start || 0),
    duration: Number(el.dataset.duration || duration),
    trimStart: Number(el.dataset.trimStart || 0),
    transitionType: el.dataset.transitionType || 'none',
    transitionDuration: Number(el.dataset.transitionDuration || 0),
  }));
  let selectedClip = null;
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
    stage.style.transform = 'translate(-50%, -50%) scale(' + Math.max(0.01, scale) + ')';
  }

  function syncMediaElement(media, clip) {
    let local = localTime(clip);
    if (Number.isFinite(media.duration) && media.duration > 0) {
      local = Math.min(local, Math.max(0, media.duration - 0.05));
    }
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

  function clipOpacity(clip) {
    if (!isActive(clip) || clip.transitionType === 'none') return 1;
    const d = Math.max(0.05, Math.min(clip.transitionDuration || 0, clip.duration / 2));
    if (!d) return 1;
    const local = currentTime - clip.start;
    const remaining = clip.duration - local;
    return Math.max(0, Math.min(1, Math.min(local / d, remaining / d)));
  }

  function render() {
    const timeline = window.__timelines?.['autohdr-video-studio'];
    if (timeline?.time) timeline.time(currentTime, false);
    for (const clip of clips) {
      const active = isActive(clip);
      clip.el.style.display = active ? '' : 'none';
      clip.el.style.opacity = active ? String(clipOpacity(clip)) : '0';
      syncMedia(clip);
    }
    window.parent?.postMessage({
      type: 'autohdr-preview-time',
      time: currentTime,
      duration,
      playing,
    }, '*');
  }

  function editable(clip) {
    return clip.kind === 'bubble' || clip.kind === 'text';
  }

  function clipByElement(el) {
    return clips.find((clip) => clip.el === el);
  }

  function compositionScale() {
    const rect = composition.getBoundingClientRect();
    return {
      x: Number(composition.dataset.width || ${EDITOR_WIDTH}) / Math.max(1, rect.width),
      y: Number(composition.dataset.height || ${EDITOR_HEIGHT}) / Math.max(1, rect.height),
      rect,
    };
  }

  function selectClip(clip) {
    if (!clip || !editable(clip)) return;
    if (selectedClip?.el === clip.el) return;
    clearSelection();
    selectedClip = clip;
    clip.el.classList.add('hf-selected');
    for (const corner of ['nw', 'ne', 'sw', 'se']) {
      const handle = document.createElement('span');
      handle.className = 'hf-resize-handle ' + corner;
      handle.dataset.corner = corner;
      handle.addEventListener('pointerdown', (event) => startPreviewEdit(event, clip, 'resize', corner));
      clip.el.appendChild(handle);
    }
    window.parent?.postMessage({
      type: 'autohdr-preview-select',
      itemId: clip.itemId,
      kind: clip.kind,
    }, '*');
  }

  function clearSelection() {
    if (!selectedClip) return;
    selectedClip.el.classList.remove('hf-selected');
    selectedClip.el.querySelectorAll('.hf-resize-handle').forEach((handle) => handle.remove());
    selectedClip = null;
  }

  function setElementBox(el, patch) {
    el.style.left = patch.x.toFixed(2) + 'px';
    el.style.top = patch.y.toFixed(2) + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.transform = 'none';
    if (Number.isFinite(patch.width)) el.style.width = patch.width.toFixed(2) + 'px';
    if (Number.isFinite(patch.height)) el.style.height = patch.height.toFixed(2) + 'px';
  }

  function startPreviewEdit(event, clip, mode, corner) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    selectClip(clip);

    const scale = compositionScale();
    const elRect = clip.el.getBoundingClientRect();
    const base = {
      x: (elRect.left - scale.rect.left) * scale.x,
      y: (elRect.top - scale.rect.top) * scale.y,
      width: elRect.width * scale.x,
      height: elRect.height * scale.y,
    };
    const start = { x: event.clientX, y: event.clientY };
    const min = clip.kind === 'text' ? { width: 260, height: 90 } : { width: 150, height: 150 };
    let finalPatch = base;

    function move(pointerEvent) {
      const dx = (pointerEvent.clientX - start.x) * scale.x;
      const dy = (pointerEvent.clientY - start.y) * scale.y;
      let patch = { ...base };
      if (mode === 'move') {
        patch.x = Math.max(0, base.x + dx);
        patch.y = Math.max(0, base.y + dy);
      } else {
        const left = corner.includes('w');
        const top = corner.includes('n');
        if (clip.kind === 'bubble') {
          const sizeDelta = Math.max(left ? -dx : dx, top ? -dy : dy);
          const nextSize = Math.max(min.width, base.width + sizeDelta);
          patch.width = nextSize;
          patch.height = nextSize;
          patch.x = left ? base.x + base.width - nextSize : base.x;
          patch.y = top ? base.y + base.height - nextSize : base.y;
        } else {
          if (left) {
            patch.x = Math.min(base.x + dx, base.x + base.width - min.width);
            patch.width = base.width + (base.x - patch.x);
          } else {
            patch.width = Math.max(min.width, base.width + dx);
          }
          if (top) {
            patch.y = Math.min(base.y + dy, base.y + base.height - min.height);
            patch.height = base.height + (base.y - patch.y);
          } else {
            patch.height = Math.max(min.height, base.height + dy);
          }
        }
      }

      patch.x = Math.round(patch.x);
      patch.y = Math.round(patch.y);
      patch.width = Math.round(patch.width);
      patch.height = Math.round(patch.height);
      setElementBox(clip.el, patch);
      finalPatch = patch;
    }

    function stop() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.parent?.postMessage({
        type: 'autohdr-preview-edit',
        itemId: clip.itemId,
        kind: clip.kind,
        patch: finalPatch,
      }, '*');
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  }

  for (const clip of clips) {
    if (!editable(clip)) continue;
    clip.el.addEventListener('pointerdown', (event) => {
      if (event.target?.classList?.contains('hf-resize-handle')) return;
      startPreviewEdit(event, clip, 'move');
    });
    clip.el.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectClip(clip);
    });
  }

  composition?.addEventListener('pointerdown', (event) => {
    const clip = clipByElement(event.target?.closest?.('.clip'));
    if (!clip || !editable(clip)) clearSelection();
  });

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
