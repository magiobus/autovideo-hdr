"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import apiClient from "@/libs/api";
import { uploadFilesToR2 } from "@/helpers/uploadToR2";
import { buildHyperframesComposition } from "@/libs/editor/hyperframes-composition";

const fieldClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-white/25 focus:bg-white/[0.06]";
const textareaClass = `${fieldClass} resize-none`;
const labelClass = "mb-2 text-xs font-medium uppercase tracking-wider text-white/40";
const pillButtonClass =
  "rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-black/50";
const ghostButtonClass =
  "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white";
const optionButtonClass =
  "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition";

const VOICE_PRESETS = [
  {
    id: "male-architect",
    gender: "male",
    label: "Architect",
    tone: "warm, low, cinematic",
    sample: "A quieter kind of luxury. Light, texture, and quiet intention.",
    sampleUrl: "/samples/voices/male-architect.mp3?v=2",
  },
  {
    id: "male-editorial",
    gender: "male",
    label: "Editorial",
    tone: "calm, confident, refined",
    sample: "Not every home asks for attention. Some simply hold it.",
    sampleUrl: "/samples/voices/male-editorial.mp3?v=2",
  },
  {
    id: "male-casual",
    gender: "male",
    label: "Casual",
    tone: "friendly, relaxed, conversational",
    sample: "This place has an easy rhythm. Bright rooms, clean finishes, and space that feels simple to settle into.",
    sampleUrl: "/samples/voices/male-casual.mp3?v=1",
  },
  {
    id: "female-architect",
    gender: "female",
    label: "Architect",
    tone: "warm, intimate, cinematic",
    sample: "A slower rhythm. A brighter frame. A home designed to be felt.",
    sampleUrl: "/samples/voices/female-architect.mp3?v=2",
  },
  {
    id: "female-editorial",
    gender: "female",
    label: "Editorial",
    tone: "soft, premium, restrained",
    sample: "Stone, light, and proportion. Every detail lands quietly.",
    sampleUrl: "/samples/voices/female-editorial.mp3?v=2",
  },
  {
    id: "female-casual",
    gender: "female",
    label: "Casual",
    tone: "friendly, natural, conversational",
    sample: "It feels bright right away. Simple spaces, thoughtful details, and a layout that makes everyday life feel easy.",
    sampleUrl: "/samples/voices/female-casual.mp3?v=1",
  },
];

const PRESENTER_PRESETS = [
  { id: "male-1", gender: "male", name: "Jake", initials: "JK", imageUrl: "/samples/presenters/male-1.jpg", tone: "calm advisor" },
  { id: "male-2", gender: "male", name: "Eddy", initials: "ED", imageUrl: "/samples/presenters/male-2.jpg", tone: "editorial host" },
  { id: "male-3", gender: "male", name: "Matt", initials: "MT", imageUrl: "/samples/presenters/male-3.jpg", tone: "luxury broker" },
  { id: "female-1", gender: "female", name: "Sofia", initials: "SF", imageUrl: "/samples/presenters/female-1.jpg", tone: "warm host" },
  { id: "female-2", gender: "female", name: "Mara", initials: "MA", imageUrl: "/samples/presenters/female-2.jpg", tone: "premium guide" },
  { id: "female-3", gender: "female", name: "Elena", initials: "EL", imageUrl: "/samples/presenters/female-3.jpg", tone: "editorial narrator" },
];

const MUSIC_PRESETS = [
  { id: "minimal-house", label: "Minimal House", sampleUrl: "/samples/music/minimal-house.wav", prompt: "minimal ambient house, soft pulse, premium architectural film, no vocals" },
  { id: "cinematic-piano", label: "Cinematic Piano", sampleUrl: "/samples/music/cinematic-piano.wav", prompt: "soft cinematic piano, warm pads, restrained low pulse, emotional but understated, no vocals" },
  { id: "editorial-luxury", label: "Editorial Luxury", sampleUrl: "/samples/music/editorial-luxury.wav", prompt: "editorial luxury music bed, elegant synth pads, subtle percussion, polished, expensive, no vocals" },
];

const EDIT_STYLE_PRESETS = [
  {
    id: "architectural-luxe",
    label: "Architectural Luxe",
    description: "Soft blur transitions, restrained lower thirds, subtle grain.",
  },
  {
    id: "editorial-listing",
    label: "Editorial Listing",
    description: "Cleaner data-forward cards, section pushes, listing details.",
  },
  {
    id: "warm-lifestyle",
    label: "Warm Lifestyle",
    description: "Gentle focus pulls, warmer captions, very light leaks.",
  },
];

const TEXT_STYLE_PRESETS = [
  { id: "estate-lower", label: "Estate lower" },
  { id: "estate-title", label: "Title card" },
  { id: "estate-spec", label: "Spec callout" },
  { id: "estate-price", label: "Price / close" },
  { id: "lower-third", label: "Classic lower" },
  { id: "headline", label: "Big headline" },
];

const Logo = () => (
  <Link href="/" className="flex items-center gap-2 font-semibold text-white">
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xs font-bold text-white">
      AH
    </span>
    AutoHDR
  </Link>
);

// ═══════════════════════════════════════════════════
// MAIN PAGE — Single-screen Suno-style workspace
// ═══════════════════════════════════════════════════
const ProjectsPage = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const pollingRef = useRef(null);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await apiClient.get("/projects");
      setProjects(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const initialFetch = setTimeout(fetchProjects, 0);
    pollingRef.current = setInterval(fetchProjects, 8000);
    return () => {
      clearTimeout(initialFetch);
      clearInterval(pollingRef.current);
    };
  }, [fetchProjects]);

  const selectedProject = projects.find((p) => p._id === selectedId) || null;

  const onProjectCreated = (projectId) => {
    setSelectedId(projectId);
    fetchProjects();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-black text-white selection:bg-white/20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-48 mx-auto h-[520px] max-w-5xl bg-[radial-gradient(ellipse_at_center,rgba(120,80,255,0.16),transparent_60%)]"
      />
      {/* ═══ LEFT SIDEBAR — Create + List ═══ */}
      <Sidebar
        projects={projects}
        loading={loading}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onProjectCreated={onProjectCreated}
      />

      {/* ═══ MAIN AREA — Selected project or empty state ═══ */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {selectedProject ? (
          <ProjectDetail
            project={selectedProject}
            onRefresh={fetchProjects}
          />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
};

// ═══════════════════════════════════════════════════
// SIDEBAR — Create new + project list
// ═══════════════════════════════════════════════════
const Sidebar = ({
  projects,
  loading,
  selectedId,
  onSelect,
  onProjectCreated,
}) => {
  const [showCreate, setShowCreate] = useState(false);

  const handleNewClick = () => {
    if (!showCreate) {
      // Opening create form — clear selection
      onSelect(null);
    }
    setShowCreate(!showCreate);
  };

  return (
    <aside className="relative z-10 flex w-80 shrink-0 flex-col overflow-hidden border-r border-white/5 bg-black/70 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-4">
        <Logo />
        <button
          className={showCreate ? ghostButtonClass : pillButtonClass}
          onClick={handleNewClick}
        >
          {showCreate ? "Cancel" : "+ New"}
        </button>
      </div>

      {/* Create form OR project list */}
      {showCreate ? (
        <CreateForm
          onCreated={(id) => {
            setShowCreate(false);
            onProjectCreated(id);
          }}
        />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12 px-4">
              <p className="text-sm text-white/40">
                No projects yet
              </p>
              <button
                className={`${pillButtonClass} mt-3`}
                onClick={() => setShowCreate(true)}
              >
                Create your first video
              </button>
            </div>
          ) : (
            <div className="space-y-2 p-3">
              {projects.map((p) => (
                <ProjectRow
                  key={p._id}
                  project={p}
                  isSelected={selectedId === p._id}
                  onClick={() => onSelect(p._id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
};

// ═══════════════════════════════════════════════════
// PROJECT ROW — Sidebar list item
// ═══════════════════════════════════════════════════
const ProjectRow = ({ project, isSelected, onClick }) => {
  const isProcessing = ["generating", "classifying", "assembling", "rendering"].includes(
    project.status
  );
  const presenterEnabled =
    project.generationOptions?.presenter?.enabled ||
    project.generationOptions?.presenterBubble;

  return (
    <button
      onClick={onClick}
      className={`w-full rounded-2xl border p-3 text-left transition ${
        isSelected
          ? "border-white/20 bg-white/[0.08]"
          : "border-white/5 bg-white/[0.03] hover:border-white/12 hover:bg-white/[0.06]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">
            {project.name || "Video Studio Project"}
          </p>
          <p className="mt-0.5 text-xs text-white/45">
            {project.clips?.length || 0} clips
            {presenterEnabled ? " · presenter" : ""}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {isProcessing && (
            <span className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-amber-300" />
          )}
          <StatusDot status={project.status} />
        </div>
      </div>

      {isProcessing && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-white transition-all duration-500"
            style={{ width: `${project.progress || 0}%` }}
          />
        </div>
      )}
    </button>
  );
};

// ═══════════════════════════════════════════════════
// CREATE FORM — Inline wizard in sidebar
// ═══════════════════════════════════════════════════
const CreateForm = ({ onCreated }) => {
  const fileInputRef = useRef(null);
  const [photos, setPhotos] = useState([]);
  const [propertyInfo, setPropertyInfo] = useState({
    narrationNotes: "",
  });
  const [generationOptions, setGenerationOptions] = useState({
    format: {
      aspectRatio: "16:9",
    },
    editStyle: {
      presetId: "architectural-luxe",
    },
    voiceover: {
      enabled: true,
      gender: "male",
      voicePresetId: "male-architect",
    },
    music: {
      enabled: true,
      mode: "preset",
      presetId: "minimal-house",
      customPrompt: "",
    },
    supportText: {
      enabled: true,
    },
    presenter: {
      enabled: false,
      gender: "male",
      presenterId: "male-1",
      customPrompt: "",
    },
  });
  const [phase, setPhase] = useState("idle"); // idle | uploading | creating
  const [styles, setStyles] = useState([]);
  const [styleId, setStyleId] = useState(null);
  const [loadingStyles, setLoadingStyles] = useState(true);
  const audioPreviewRef = useRef(null);

  useEffect(() => {
    apiClient
      .get("/styles")
      .then((data) => {
        setStyles(data);
        if (data.length === 1) setStyleId(data[0]._id);
      })
      .catch(() => {})
      .finally(() => setLoadingStyles(false));
  }, []);

  const addPhotos = (files) => {
    const newPhotos = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({
        file: f,
        preview: URL.createObjectURL(f),
        id: `${f.name}-${Date.now()}-${Math.random()}`,
      }));
    setPhotos((prev) => [...prev, ...newPhotos]);
  };

  const removePhoto = (id) => {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === id);
      if (photo) URL.revokeObjectURL(photo.preview);
      return prev.filter((p) => p.id !== id);
    });
  };

  const canSubmit =
    photos.length > 0 && styleId && phase === "idle";

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      setPhase("uploading");
      const uploadResults = await uploadFilesToR2(
        photos.map((p) => p.file)
      );

      setPhase("creating");
      const result = await apiClient.post("/projects", {
        styleId,
        sourceImages: uploadResults.map((r) => ({
          url: r.publicUrl,
          key: r.key,
        })),
        propertyInfo,
        generationOptions,
      });

      toast.success("Video generation started!");
      onCreated(result.projectId);
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message);
      setPhase("idle");
    }
  };

  const handleChange = (field) => (e) => {
    setPropertyInfo((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const setOptionEnabled = (field, enabled) => {
    setGenerationOptions((prev) => {
      const next = {
        ...prev,
        [field]: {
          ...prev[field],
          enabled,
        },
      };
      if (field === "voiceover" && !enabled) {
        next.presenter = {
          ...prev.presenter,
          enabled: false,
        };
      }
      return next;
    });
  };

  const updateOption = (field, patch) => {
    setGenerationOptions((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        ...patch,
      },
    }));
  };

  const updateFormat = (aspectRatio) => {
    setGenerationOptions((prev) => ({
      ...prev,
      format: {
        ...(prev.format || {}),
        aspectRatio,
      },
    }));
  };

  const updateEditStyle = (presetId) => {
    setGenerationOptions((prev) => ({
      ...prev,
      editStyle: {
        ...(prev.editStyle || {}),
        presetId,
      },
    }));
  };

  const handleVoiceGenderChange = (gender) => {
    const preset = VOICE_PRESETS.find((voice) => voice.gender === gender);
    const presenter = PRESENTER_PRESETS.find((item) => item.gender === gender);
    setGenerationOptions((prev) => ({
      ...prev,
      voiceover: {
        ...prev.voiceover,
        gender,
        voicePresetId: preset?.id || prev.voiceover.voicePresetId,
      },
      presenter: {
        ...prev.presenter,
        gender,
        presenterId: presenter?.id || prev.presenter.presenterId,
      },
    }));
  };

  const playVoiceSample = (voicePreset) => {
    if (voicePreset.sampleUrl) {
      playAudioPreview(voicePreset.sampleUrl);
      return;
    }

    if (!window.speechSynthesis) {
      toast.error("Voice preview is not supported in this browser");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(voicePreset.sample);
    utterance.rate = 0.82;
    utterance.pitch = voicePreset.gender === "female" ? 1.08 : 0.86;
    window.speechSynthesis.speak(utterance);
  };

  const playAudioPreview = (src) => {
    if (!audioPreviewRef.current) return;
    audioPreviewRef.current.pause();
    audioPreviewRef.current.src = src;
    audioPreviewRef.current.currentTime = 0;
    audioPreviewRef.current.play().catch(() => {
      toast.error("Could not play preview");
    });
  };

  const selectedVoice = VOICE_PRESETS.find(
    (voice) => voice.id === generationOptions.voiceover.voicePresetId
  );
  const selectedMusicPreset = MUSIC_PRESETS.find(
    (preset) => preset.id === generationOptions.music.presetId
  );

  return (
    <div className="flex-1 space-y-5 overflow-y-auto p-4">
      <audio ref={audioPreviewRef} className="hidden" />
      {/* Photos */}
      <div>
        <h3 className={labelClass}>Photos</h3>
        <div
          className="cursor-pointer rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-center transition hover:border-white/30 hover:bg-white/[0.05]"
          onClick={() => fileInputRef.current?.click()}
          onDrop={(e) => {
            e.preventDefault();
            addPhotos(e.dataTransfer.files);
          }}
          onDragOver={(e) => e.preventDefault()}
        >
          <p className="text-xs text-white/45">
            {photos.length > 0
              ? `${photos.length} photo${photos.length !== 1 ? "s" : ""} — click to add more`
              : "Drop photos or click to browse"}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              addPhotos(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {photos.length > 0 && (
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group aspect-square">
                <img
                  src={photo.preview}
                  alt=""
                  className="h-full w-full rounded-lg object-cover"
                />
                <button
                  onClick={() => removePhoto(photo.id)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[10px] leading-none text-white opacity-0 ring-1 ring-white/10 transition-opacity group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Style selector */}
      {styles.length > 1 && (
        <div>
          <h3 className={labelClass}>Style</h3>
          <select
            className={fieldClass}
            value={styleId || ""}
            onChange={(e) => setStyleId(e.target.value)}
          >
            <option value="" disabled>
              Select style
            </option>
            {styles.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <h3 className={labelClass}>Format</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => updateFormat("16:9")}
            className={`${optionButtonClass} ${
              generationOptions.format?.aspectRatio === "16:9"
                ? "border-white/25 bg-white/[0.09] text-white"
                : "border-white/5 bg-white/[0.03] text-white/45 hover:border-white/12 hover:bg-white/[0.05]"
            }`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-current/40 text-xs font-semibold">
              16:9
            </span>
            <span className="min-w-0 text-sm font-medium">Landscape</span>
          </button>
          <button
            type="button"
            onClick={() => updateFormat("9:16")}
            className={`${optionButtonClass} ${
              generationOptions.format?.aspectRatio === "9:16"
                ? "border-white/25 bg-white/[0.09] text-white"
                : "border-white/5 bg-white/[0.03] text-white/45 hover:border-white/12 hover:bg-white/[0.05]"
            }`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-current/40 text-xs font-semibold">
              9:16
            </span>
            <span className="min-w-0 text-sm font-medium">Portrait</span>
          </button>
        </div>
      </div>

      <div>
        <h3 className={labelClass}>Edit Style</h3>
        <div className="space-y-2">
          {EDIT_STYLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => updateEditStyle(preset.id)}
              className={`${optionButtonClass} ${
                generationOptions.editStyle?.presetId === preset.id
                  ? "border-white/25 bg-white/[0.09] text-white"
                  : "border-white/5 bg-white/[0.03] text-white/50 hover:border-white/12 hover:bg-white/[0.05]"
              }`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-current/35 text-[10px] font-semibold">
                HF
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{preset.label}</span>
                <span className="mt-0.5 block text-xs text-white/35">
                  {preset.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Creative layers */}
      <div>
        <h3 className={labelClass}>Creative Layers</h3>
        <div className="grid grid-cols-2 gap-2">
          <OptionToggle
            label="Voice"
            icon="VO"
            active={generationOptions.voiceover.enabled}
            onClick={() =>
              setOptionEnabled("voiceover", !generationOptions.voiceover.enabled)
            }
          />
          <OptionToggle
            label="Music"
            icon="MU"
            active={generationOptions.music.enabled}
            onClick={() =>
              setOptionEnabled("music", !generationOptions.music.enabled)
            }
          />
          <OptionToggle
            label="Text"
            icon="T"
            active={generationOptions.supportText.enabled}
            onClick={() =>
              setOptionEnabled("supportText", !generationOptions.supportText.enabled)
            }
          />
          <OptionToggle
            label="Presenter"
            icon="AV"
            active={generationOptions.presenter.enabled}
            disabled={!generationOptions.voiceover.enabled}
            onClick={() =>
              generationOptions.voiceover.enabled &&
              setOptionEnabled("presenter", !generationOptions.presenter.enabled)
            }
          />
        </div>
      </div>

      {generationOptions.voiceover.enabled && (
        <div className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.025] p-3">
          <div>
            <h3 className={labelClass}>Voice</h3>
            <div className="grid grid-cols-2 gap-1 rounded-full bg-white/[0.04] p-1">
              {["male", "female"].map((gender) => (
                <button
                  key={gender}
                  type="button"
                  onClick={() => handleVoiceGenderChange(gender)}
                  className={`rounded-full px-3 py-2 text-xs font-medium capitalize transition ${
                    generationOptions.voiceover.gender === gender
                      ? "bg-white text-black"
                      : "text-white/50 hover:text-white"
                  }`}
                >
                  {gender}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {VOICE_PRESETS.filter(
              (voice) => voice.gender === generationOptions.voiceover.gender
            ).map((voice) => (
              <div
                key={voice.id}
                className={`rounded-xl border p-3 transition ${
                  generationOptions.voiceover.voicePresetId === voice.id
                    ? "border-white/25 bg-white/[0.07]"
                    : "border-white/5 bg-white/[0.02]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() =>
                      updateOption("voiceover", { voicePresetId: voice.id })
                    }
                  >
                    <p className="text-sm font-medium text-white">{voice.label}</p>
                    <p className="mt-0.5 truncate text-xs text-white/40">
                      {voice.tone}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => playVoiceSample(voice)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
                  >
                    Sample
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {generationOptions.presenter.enabled && generationOptions.voiceover.enabled && (
        <div className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.025] p-3">
          <div className="flex items-center justify-between">
            <h3 className={labelClass}>Presenter</h3>
            <span className="mb-2 text-[10px] uppercase tracking-wider text-white/30">
              {generationOptions.presenter.gender}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {PRESENTER_PRESETS.filter(
              (presenter) => presenter.gender === generationOptions.presenter.gender
            ).map((presenter) => (
              <button
                key={presenter.id}
                type="button"
                onClick={() =>
                  updateOption("presenter", { presenterId: presenter.id })
                }
                className={`rounded-2xl border p-2 text-center transition ${
                  generationOptions.presenter.presenterId === presenter.id
                    ? "border-white/30 bg-white/[0.08]"
                    : "border-white/5 bg-white/[0.02] hover:border-white/15"
                }`}
              >
                {presenter.imageUrl ? (
                  <img
                    src={presenter.imageUrl}
                    alt=""
                    className="mx-auto h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[linear-gradient(135deg,#d7c6a0,#6f8ea3)] text-xs font-semibold text-black">
                    {presenter.initials}
                  </span>
                )}
                <span className="mt-2 block truncate text-xs font-medium text-white">
                  {presenter.name}
                </span>
              </button>
            ))}
          </div>
          <textarea
            placeholder="Custom presenter prompt, e.g. polished Compass-style agent, black turtleneck, soft studio light"
            className={`${textareaClass} h-20`}
            value={generationOptions.presenter.customPrompt}
            onChange={(e) =>
              updateOption("presenter", { customPrompt: e.target.value })
            }
          />
        </div>
      )}

      {generationOptions.music.enabled && (
        <div className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.025] p-3">
          <h3 className={labelClass}>Music</h3>
          <div className="grid grid-cols-2 gap-1 rounded-full bg-white/[0.04] p-1">
            {["preset", "custom"].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => updateOption("music", { mode })}
                className={`rounded-full px-3 py-2 text-xs font-medium capitalize transition ${
                  generationOptions.music.mode === mode
                    ? "bg-white text-black"
                    : "text-white/50 hover:text-white"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {generationOptions.music.mode === "preset" ? (
            <div className="space-y-2">
              {MUSIC_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    generationOptions.music.presetId === preset.id
                      ? "border-white/25 bg-white/[0.07]"
                      : "border-white/5 bg-white/[0.02] hover:border-white/15"
                  }`}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => updateOption("music", { presetId: preset.id })}
                  >
                    <span className="block text-sm font-medium text-white">
                      {preset.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-white/40">
                      {preset.prompt}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => playAudioPreview(preset.sampleUrl)}
                    className="mt-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
                  >
                    Sample
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <textarea
              placeholder="Describe the music bed: luxury ambient house, no vocals, soft pulse, emotional but restrained"
              className={`${textareaClass} h-24`}
              value={generationOptions.music.customPrompt}
              onChange={(e) =>
                updateOption("music", { customPrompt: e.target.value })
              }
            />
          )}
          {selectedMusicPreset && generationOptions.music.mode === "preset" && (
            <p className="text-[10px] text-white/30">
              Music prompt: {selectedMusicPreset.prompt}
            </p>
          )}
        </div>
      )}

      {/* Creative direction */}
      <div>
        <h3 className={labelClass}>Creative Direction</h3>
        <textarea
          placeholder={"Talking points the voiceover must include:\n• say this is great for a hackathon\n• mention the community and snacks all day\n• keep it casual, like a friend explaining the place"}
          className={`${textareaClass} h-28`}
          value={propertyInfo.narrationNotes}
          onChange={handleChange("narrationNotes")}
        />
      </div>

      {/* Generate button */}
      <button
        className={`${pillButtonClass} flex w-full items-center justify-center gap-2`}
        onClick={handleSubmit}
        disabled={!canSubmit}
      >
        {phase === "uploading" ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border border-black/20 border-t-black" />
            Uploading...
          </>
        ) : phase === "creating" ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border border-black/20 border-t-black" />
            Creating...
          </>
        ) : (
          "Generate Video"
        )}
      </button>
      {selectedVoice && (
        <p className="text-center text-[10px] text-white/30">
          Selected voice: {selectedVoice.label} / {selectedVoice.gender}
        </p>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════
// PROJECT DETAIL — Main area when a project is selected
// ═══════════════════════════════════════════════════
const ProjectDetail = ({ project, onRefresh }) => {
  const previewRef = useRef(null);
  const previewTimeRef = useRef(0);
  const pendingPreviewSeekRef = useRef(null);
  const [selectedClip, setSelectedClip] = useState(null);
  const [editorDraft, setEditorDraft] = useState(null);
  const [selectedTextId, setSelectedTextId] = useState(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [avatarGenerating, setAvatarGenerating] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const presenterEnabled =
    project.generationOptions?.presenter?.enabled ||
    project.generationOptions?.presenterBubble;
  const editorState =
    editorDraft?.projectId === project._id
      ? editorDraft.editorState
      : project.editorState || null;

  const isProcessing = ["generating", "classifying", "assembling", "rendering"].includes(
    project.status
  );
  const completedClips =
    project.clips?.filter((c) => c.videoJob?.status === "completed") || [];
  const videoItems =
    editorState?.tracks?.find((track) => track.id === "video")?.items || [];
  const textItems =
    editorState?.tracks?.find((track) => track.id === "text")?.items || [];
  const overlayItems =
    editorState?.tracks?.find((track) => track.id === "overlay")?.items || [];
  const legacyAudioItems =
    editorState?.tracks?.find((track) => track.id === "audio")?.items || [];
  const voiceoverItems =
    editorState?.tracks?.find((track) => track.id === "voiceover")?.items ||
    legacyAudioItems.filter((item) => item.id === "voiceover");
  const musicItems =
    editorState?.tracks?.find((track) => track.id === "music")?.items ||
    legacyAudioItems.filter((item) => item.id === "music");
  const voiceoverTrackId = editorState?.tracks?.some((track) => track.id === "voiceover")
    ? "voiceover"
    : "audio";
  const musicTrackId = editorState?.tracks?.some((track) => track.id === "music")
    ? "music"
    : "audio";
  const selectedOverlay = overlayItems.find((item) => item.id === selectedOverlayId);
  const selectedText = textItems.find((item) => item.id === selectedTextId);
  const activeOverlay = selectedOverlay || (!selectedTextId ? overlayItems[0] : null);
  const activeText = activeOverlay ? null : selectedText || textItems[0];
  const hasEditor = Boolean(editorState);
  const isRenderDirty = editorState?.render?.status === "dirty";
  const previewDuration = Math.max(0.1, editorState?.duration || 0.1);
  const previewAspectRatio = `${editorState?.width || 1920} / ${editorState?.height || 1080}`;
  const livePreviewHtml = useMemo(
    () =>
      editorState
        ? buildHyperframesComposition(editorState, { includePreviewRuntime: true })
        : "",
    [editorState]
  );

  const sendPreviewCommand = useCallback((action, time = previewTime) => {
    previewRef.current?.contentWindow?.postMessage(
      {
        type: "autohdr-preview",
        action,
        time,
      },
      "*"
    );
  }, [previewTime]);

  useEffect(() => {
    previewTimeRef.current = previewTime;
  }, [previewTime]);

  useEffect(() => {
    if (hasEditor) pendingPreviewSeekRef.current = previewTimeRef.current;
  }, [hasEditor, livePreviewHtml]);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type !== "autohdr-preview-time") return;
      const nextTime = event.data.time || 0;
      const pendingTime = pendingPreviewSeekRef.current;
      if (
        pendingTime !== null &&
        pendingTime > 0.05 &&
        nextTime === 0 &&
        !event.data.playing
      ) {
        return;
      }
      if (
        pendingTime !== null &&
        Math.abs(nextTime - pendingTime) < 0.15
      ) {
        pendingPreviewSeekRef.current = null;
      }
      previewTimeRef.current = nextTime;
      setPreviewTime(nextTime);
      setIsPreviewPlaying(Boolean(event.data.playing));
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const tag = event.target?.tagName?.toLowerCase();
      if (!hasEditor || ["input", "textarea", "select"].includes(tag)) return;
      if (event.code === "Space") {
        event.preventDefault();
        sendPreviewCommand(isPreviewPlaying ? "pause" : "play");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasEditor, isPreviewPlaying, sendPreviewCommand]);

  const seekPreview = (time) => {
    const nextTime = Math.max(0, Math.min(previewDuration, Number(time) || 0));
    setPreviewTime(nextTime);
    sendPreviewCommand("seek", nextTime);
  };

  const syncPreviewAfterLoad = useCallback(() => {
    window.setTimeout(() => {
      const targetTime = pendingPreviewSeekRef.current ?? previewTimeRef.current;
      sendPreviewCommand("seek", targetTime);
      if (isPreviewPlaying) sendPreviewCommand("play", targetTime);
    }, 0);
  }, [isPreviewPlaying, sendPreviewCommand]);

  const updateEditorState = useCallback((updater) => {
    setEditorDraft((current) => {
      const prev =
        current?.projectId === project._id
          ? current.editorState
          : project.editorState || null;
      const next = typeof updater === "function" ? updater(prev) : updater;
      return {
        projectId: project._id,
        editorState: normalizeClientEditorState({
          ...next,
          render: {
            ...(next.render || {}),
            status: next.render?.status === "rendering" ? "rendering" : "dirty",
          },
        }),
      };
    });
  }, [project._id, project.editorState]);

  const saveEditor = async () => {
    if (!editorState) return;
    setSaving(true);
    try {
      const result = await apiClient.patch(`/projects/${project._id}/editor`, {
        editorState,
      });
      setEditorDraft({ projectId: project._id, editorState: result.editorState });
      toast.success("Edit saved");
      onRefresh?.();
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const renderProject = async () => {
    setRendering(true);
    try {
      if (isRenderDirty) await saveEditor();
      await apiClient.post(`/projects/${project._id}/render`);
      toast.success("Render started");
      onRefresh?.();
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message);
    } finally {
      setRendering(false);
    }
  };

  const generateTalkingAvatar = async () => {
    if (!editorState) return;
    setAvatarGenerating(true);
    try {
      if (isRenderDirty) await saveEditor();
      await apiClient.post(`/projects/${project._id}/avatar`);
      toast.success("Talking avatar updated");
      onRefresh?.();
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message);
    } finally {
      setAvatarGenerating(false);
    }
  };

  const updateTrackItem = useCallback((trackId, itemId, patch) => {
    updateEditorState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) =>
        track.id === trackId
          ? {
              ...track,
              items: track.items.map((item) =>
                item.id === itemId ? { ...item, ...patch } : item
              ),
            }
          : trackId === "voiceover" && itemId === "voiceover" && track.id === "overlay"
          ? {
              ...track,
              items: track.items.map((item) =>
                item.id === "presenter-bubble"
                  ? {
                      ...item,
                      ...(Number.isFinite(patch.start) ? { start: patch.start } : {}),
                      ...(Number.isFinite(patch.duration)
                        ? { duration: patch.duration }
                        : {}),
                      ...(Number.isFinite(patch.trimStart)
                        ? { trimStart: patch.trimStart }
                        : {}),
                    }
                  : item
              ),
            }
          : track
      ),
    }));
  }, [updateEditorState]);

  const deleteTimelineItem = (trackId, itemId) => {
    updateEditorState((prev) => {
      const target = prev.tracks
        .find((track) => track.id === trackId)
        ?.items.find((item) => item.id === itemId);

      return {
        ...prev,
        tracks: prev.tracks.map((track) => {
          if (track.id === trackId) {
            return {
              ...track,
              items: track.items.filter((item) => item.id !== itemId),
            };
          }
          if (trackId === "voiceover" && itemId === "voiceover" && track.id === "overlay") {
            return {
              ...track,
              items: track.items.filter((item) => item.id !== "presenter-bubble"),
            };
          }
          if (trackId === "video" && Number.isInteger(target?.clipIndex)) {
            return {
              ...track,
              items: track.items.filter((item) => item.clipIndex !== target.clipIndex),
            };
          }
          return track;
        }),
      };
    });
    if (trackId === "text" && selectedTextId === itemId) setSelectedTextId(null);
    if (trackId === "overlay" && selectedOverlayId === itemId) setSelectedOverlayId(null);
  };

  useEffect(() => {
    const handlePreviewEdit = (event) => {
      const data = event.data || {};
      if (
        data.type !== "autohdr-preview-edit" &&
        data.type !== "autohdr-preview-select"
      ) {
        return;
      }
      const trackId = data.kind === "bubble" ? "overlay" : "text";
      if (trackId === "overlay") {
        setSelectedOverlayId(data.itemId);
        setSelectedTextId(null);
      } else {
        setSelectedTextId(data.itemId);
        setSelectedOverlayId(null);
      }
      if (data.type === "autohdr-preview-edit") {
        updateTrackItem(trackId, data.itemId, data.patch || {});
      }
    };
    window.addEventListener("message", handlePreviewEdit);
    return () => window.removeEventListener("message", handlePreviewEdit);
  }, [updateTrackItem]);

  const updateTextItem = (itemId, patch) => {
    updateEditorState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) =>
        track.id === "text"
          ? {
              ...track,
              items: track.items.map((item) =>
                item.id === itemId ? { ...item, ...patch } : item
              ),
            }
          : track
      ),
    }));
  };

  const updateOverlayItem = (itemId, patch) => {
    updateEditorState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) =>
        track.id === "overlay"
          ? {
              ...track,
              items: track.items.map((item) =>
                item.id === itemId ? { ...item, ...patch } : item
              ),
            }
          : track
      ),
    }));
  };

  return (
    <>
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/5 bg-black/50 px-6 py-4 backdrop-blur-xl">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-white">
            {project.name || "Video Studio Project"}
          </h1>
          <p className="text-xs text-white/45">
            {(project.clips?.length || 0)} clips
            {presenterEnabled ? " · presenter selected" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={project.status} />
          {hasEditor && (
            <button
              type="button"
              className={ghostButtonClass}
              onClick={saveEditor}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save edit"}
            </button>
          )}
          {hasEditor && (
            <button
              type="button"
              className={pillButtonClass}
              onClick={renderProject}
              disabled={rendering || project.status === "rendering"}
            >
              {rendering || project.status === "rendering" ? "Exporting..." : "Export MP4"}
            </button>
          )}
          {project.finalVideoUrl && (
            <a
              href={project.finalVideoUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className={`${pillButtonClass} flex items-center gap-2 py-2`}
            >
              <DownloadIcon />
              Export
            </a>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Video preview */}
        <div className="flex flex-1 items-center justify-center p-6">
          {hasEditor ? (
            <div className="max-h-full w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
              <iframe
                ref={previewRef}
                key={project._id}
                title="Video edit preview"
                srcDoc={livePreviewHtml}
                className="w-full"
                style={{ aspectRatio: previewAspectRatio }}
                allow="autoplay; fullscreen"
                onLoad={syncPreviewAfterLoad}
              />
              <PreviewTransport
                currentTime={previewTime}
                duration={previewDuration}
                isPlaying={isPreviewPlaying}
                onPlayPause={() =>
                  sendPreviewCommand(isPreviewPlaying ? "pause" : "play")
                }
                onStop={() => {
                  setPreviewTime(0);
                  sendPreviewCommand("stop", 0);
                }}
                onSeek={seekPreview}
              />
            </div>
          ) : project.finalVideoUrl ? (
            <video
              src={project.finalVideoUrl}
              controls
              className="max-h-full max-w-full rounded-2xl border border-white/10 shadow-2xl"
              style={{ aspectRatio: "16/9" }}
            />
          ) : isProcessing ? (
            <ProcessingState
              project={project}
              completedClips={completedClips}
            />
          ) : project.status === "failed" ? (
            <div className="text-center space-y-2">
              <div className="text-4xl text-rose-300">!</div>
              <p className="font-medium text-rose-200">Generation failed</p>
            </div>
          ) : (
            <p className="text-white/30">No video yet</p>
          )}
        </div>

        {/* Right panel — clip details */}
        {hasEditor && (
          <EditorInspector
            overlayItems={overlayItems}
            textItems={textItems}
            activeOverlay={activeOverlay}
            activeText={activeText}
            voiceoverItems={voiceoverItems}
            avatarStatus={editorState?.avatar?.status}
            avatarGenerating={avatarGenerating}
            onSelectOverlay={(id) => {
              setSelectedOverlayId(id);
              setSelectedTextId(null);
            }}
            onSelectText={(id) => {
              setSelectedTextId(id);
              setSelectedOverlayId(null);
            }}
            onOverlayChange={(patch) =>
              activeOverlay && updateOverlayItem(activeOverlay.id, patch)
            }
            onGenerateAvatar={generateTalkingAvatar}
            onTextChange={(patch) =>
              activeText && updateTextItem(activeText.id, patch)
            }
          />
        )}
        {!hasEditor && selectedClip !== null && project.clips?.[selectedClip] && (
          <ClipPanel
            clip={project.clips[selectedClip]}
            index={selectedClip}
            onClose={() => setSelectedClip(null)}
          />
        )}
      </div>

      {/* Bottom timeline */}
      {hasEditor ? (
        <EditorTimeline
          videoItems={videoItems}
          textItems={textItems}
          overlayItems={overlayItems}
          voiceoverItems={voiceoverItems}
          musicItems={musicItems}
          voiceoverTrackId={voiceoverTrackId}
          musicTrackId={musicTrackId}
          selectedTextId={activeText?.id}
          selectedOverlayId={activeOverlay?.id}
          currentTime={previewTime}
          duration={previewDuration}
          isPlaying={isPreviewPlaying}
          onSeek={seekPreview}
          onItemChange={updateTrackItem}
          onItemDelete={deleteTimelineItem}
          onSelectText={(id) => {
            setSelectedTextId(id);
            setSelectedOverlayId(null);
          }}
          onSelectOverlay={(id) => {
            setSelectedOverlayId(id);
            setSelectedTextId(null);
          }}
        />
      ) : (
        project.clips?.length > 0 && (
          <ClipTimeline
            project={project}
            clips={project.clips}
            selectedClip={selectedClip}
            onSelect={(i) => setSelectedClip(selectedClip === i ? null : i)}
          />
        )
      )}
    </>
  );
};

const normalizeClientEditorState = (editorState) => {
  const itemEnds = (editorState.tracks || [])
    .flatMap((track) => track.items || [])
    .map((item) => Number(item.start || 0) + Number(item.duration || 0));
  return { ...editorState, duration: Math.max(0.1, ...itemEnds) };
};

const PreviewTransport = ({
  currentTime,
  duration,
  isPlaying,
  onPlayPause,
  onStop,
  onSeek,
}) => (
  <div className="flex items-center gap-3 border-t border-white/10 bg-black/90 px-4 py-3">
    <button
      type="button"
      onClick={onPlayPause}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/90"
      aria-label={isPlaying ? "Pause preview" : "Play preview"}
    >
      {isPlaying ? "Ⅱ" : "▶"}
    </button>
    <button
      type="button"
      onClick={onStop}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm text-white/70 transition hover:bg-white/[0.08] hover:text-white"
      aria-label="Stop preview"
    >
      ■
    </button>
    <span className="w-28 font-mono text-xs text-white/55">
      {formatTime(currentTime)} / {formatTime(duration)}
    </span>
    <input
      type="range"
      min="0"
      max={duration}
      step="0.01"
      value={Math.min(currentTime, duration)}
      onChange={(e) => onSeek(e.target.value)}
      className="h-1 flex-1 accent-white"
      aria-label="Preview timeline scrubber"
    />
  </div>
);

const EditorTimeline = ({
  videoItems,
  textItems,
  overlayItems,
  voiceoverItems,
  musicItems,
  voiceoverTrackId,
  musicTrackId,
  selectedTextId,
  selectedOverlayId,
  currentTime,
  duration,
  isPlaying,
  onSeek,
  onItemChange,
  onItemDelete,
  onSelectText,
  onSelectOverlay,
}) => {
  const allTimelineItems = [
    ...videoItems,
    ...overlayItems,
    ...textItems,
    ...voiceoverItems,
    ...musicItems,
  ];
  const timelineDuration = Math.max(
    duration || 10,
    ...allTimelineItems.map(
      (item) => Number(item.start || 0) + Number(item.duration || 0)
    )
  );
  const pixelsPerSecond = 28;
  const trackWidth = Math.max(720, timelineDuration * pixelsPerSecond);

  return (
    <div className="border-t border-white/5 bg-black/75 px-5 py-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-white/40">
          Timeline
        </span>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${isPlaying ? "bg-emerald-400" : "bg-white/20"}`} />
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-xs text-white/35">
            {formatTime(currentTime)} / {formatTime(timelineDuration)}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="min-w-max">
          <div className="mb-1 grid grid-cols-[86px_1fr] gap-2">
            <div />
            <TimeRuler
              currentTime={currentTime}
              duration={timelineDuration}
              width={trackWidth}
              onSeek={onSeek}
            />
          </div>
          <TimelineTrack label="Video" width={trackWidth} currentTime={currentTime} duration={timelineDuration} onSeek={onSeek}>
            {videoItems.map((item, index) => (
              <TimelineBlock
                key={item.id}
                item={item}
                trackId="video"
                width={trackWidth}
                duration={timelineDuration}
                color="pink"
                onChange={onItemChange}
                onDelete={onItemDelete}
              >
                <div className="flex h-full items-center gap-2 px-2">
                  <div className="h-10 w-16 shrink-0 overflow-hidden rounded bg-black/20">
                    {item.sourceUrl ? (
                      <video src={item.sourceUrl} muted className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-white">
                      Clip {index + 1}
                    </span>
                    <span className="block font-mono text-[10px] text-white/70">
                      {Number(item.start || 0).toFixed(1)}s / {Number(item.duration || 0).toFixed(1)}s
                    </span>
                  </div>
                </div>
              </TimelineBlock>
            ))}
          </TimelineTrack>
          {overlayItems.length > 0 && (
          <TimelineTrack label="Avatar" width={trackWidth} currentTime={currentTime} duration={timelineDuration} onSeek={onSeek}>
            {overlayItems.map((item) => (
              <TimelineBlock
                key={item.id}
                item={item}
                trackId="overlay"
                width={trackWidth}
                duration={timelineDuration}
                color="cyan"
                selected={selectedOverlayId === item.id}
                onChange={onItemChange}
                onDelete={onItemDelete}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectOverlay(item.id);
                }}
              >
                <span className="block truncate font-medium">Presenter bubble</span>
                <span className="block font-mono text-[10px] opacity-65">
                  {Number(item.start || 0).toFixed(1)}s / {Number(item.duration || 0).toFixed(1)}s
                </span>
              </TimelineBlock>
            ))}
            </TimelineTrack>
      )}
      {textItems.length > 0 && (
          <TimelineTrack label="Text" width={trackWidth} currentTime={currentTime} duration={timelineDuration} onSeek={onSeek}>
            {textItems.map((item) => (
              <TimelineBlock
                key={item.id}
                item={item}
                trackId="text"
                width={trackWidth}
                duration={timelineDuration}
                color="violet"
                selected={selectedTextId === item.id}
                onChange={onItemChange}
                onDelete={onItemDelete}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectText(item.id);
                }}
              >
                <span className="block truncate font-medium">
                  {item.text || "Text"}
                </span>
                <span className="block font-mono text-[10px] opacity-60">
                  {Number(item.start || 0).toFixed(1)}s / {Number(item.duration || 0).toFixed(1)}s
                </span>
              </TimelineBlock>
            ))}
            </TimelineTrack>
      )}
          {voiceoverItems.length > 0 && (
            <TimelineTrack label="Voice" width={trackWidth} currentTime={currentTime} duration={timelineDuration} onSeek={onSeek}>
              {voiceoverItems.map((item) => (
                <TimelineBlock
                  key={item.id}
                  item={item}
                  trackId={voiceoverTrackId}
                  width={trackWidth}
                  duration={timelineDuration}
                  color="emerald"
                  onChange={onItemChange}
                  onDelete={onItemDelete}
                >
                  <span className="block truncate font-medium">Voiceover</span>
                  <span className="block font-mono text-[10px] opacity-65">
                    {Number(item.start || 0).toFixed(1)}s / {Number(item.duration || 0).toFixed(1)}s
                  </span>
                </TimelineBlock>
              ))}
            </TimelineTrack>
          )}
          {musicItems.length > 0 && (
            <TimelineTrack label="Music" width={trackWidth} currentTime={currentTime} duration={timelineDuration} onSeek={onSeek}>
              {musicItems.map((item) => (
                <TimelineBlock
                  key={item.id}
                  item={item}
                  trackId={musicTrackId}
                  width={trackWidth}
                  duration={timelineDuration}
                  color="amber"
                  onChange={onItemChange}
                  onDelete={onItemDelete}
                >
                  <span className="block truncate font-medium">Music bed</span>
                  <span className="block font-mono text-[10px] opacity-65">
                    {Number(item.start || 0).toFixed(1)}s / {Number(item.duration || 0).toFixed(1)}s
                  </span>
                </TimelineBlock>
              ))}
            </TimelineTrack>
          )}
        </div>
      </div>
    </div>
  );
};

const TimelineTrack = ({ label, width, currentTime, duration, onSeek, children }) => (
  <div className="mb-2 grid grid-cols-[86px_1fr] gap-2">
    <div className="flex h-14 items-center rounded-lg border border-white/5 bg-white/[0.025] px-3 text-xs font-medium uppercase tracking-wider text-white/35">
      {label}
    </div>
    <div
      className="relative h-14 rounded-lg border border-white/5 bg-white/[0.025]"
      style={{ width }}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientX - rect.left) / rect.width;
        onSeek(Math.max(0, Math.min(duration, ratio * duration)));
      }}
    >
      <div
        className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-rose-400"
        style={{ left: `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%` }}
      />
      {children}
    </div>
  </div>
);

const TimeRuler = ({ currentTime, duration, width, onSeek }) => {
  const marks = Array.from({ length: Math.floor(duration / 5) + 1 }, (_, i) => i * 5);
  return (
    <div
      className="relative h-8 cursor-col-resize select-none rounded-md hover:bg-white/[0.025]"
      style={{ width }}
      onPointerDown={(event) =>
        startTimelineScrub({ event, duration, onSeek })
      }
    >
      <div
        className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-rose-400"
        style={{ left: `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%` }}
      />
      {marks.map((mark) => (
        <div
          key={mark}
          className="absolute top-0 h-full border-l border-white/10 pl-1 pt-1 font-mono text-[10px] text-white/30"
          style={{ left: `${(mark / duration) * 100}%` }}
        >
          {mark}s
        </div>
      ))}
    </div>
  );
};

const startTimelineScrub = ({ event, duration, onSeek }) => {
  event.preventDefault();
  event.stopPropagation();

  const target = event.currentTarget;
  const seekFromEvent = (pointerEvent) => {
    const rect = target.getBoundingClientRect();
    const ratio = (pointerEvent.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(duration, ratio * duration)));
  };
  const stop = () => {
    window.removeEventListener("pointermove", seekFromEvent);
    window.removeEventListener("pointerup", stop);
  };

  seekFromEvent(event);
  window.addEventListener("pointermove", seekFromEvent);
  window.addEventListener("pointerup", stop, { once: true });
};

const TimelineBlock = ({
  item,
  trackId,
  width,
  duration,
  color,
  selected = false,
  onChange,
  onDelete,
  onClick,
  children,
}) => {
  const colorClass = {
    pink: "border-pink-300/40 bg-pink-500/85 text-white hover:ring-pink-200/40",
    cyan: selected
      ? "border-cyan-100/70 bg-cyan-400/35 text-cyan-50 hover:ring-cyan-100/40"
      : "border-cyan-300/30 bg-cyan-500/25 text-cyan-100 hover:ring-cyan-200/30",
    violet: selected
      ? "border-violet-100/70 bg-violet-500/60 text-white hover:ring-violet-100/40"
      : "border-violet-300/25 bg-violet-500/35 text-violet-100 hover:ring-violet-200/30",
    emerald: "border-emerald-300/30 bg-emerald-500/25 text-emerald-50 hover:ring-emerald-200/30",
    amber: "border-amber-300/30 bg-amber-500/25 text-amber-50 hover:ring-amber-200/30",
  }[color];

  const startEdit = (event, mode) => {
    startTimelinePointerEdit({
      event,
      item,
      mode,
      timelineDuration: duration,
      trackWidth: width,
      minDuration: item.kind === "video" ? 0.6 : 0.2,
      onChange: (patch) => onChange(trackId, item.id, patch),
    });
  };

  return (
    <button
      type="button"
      onPointerDown={(event) => startEdit(event, "move")}
      onClick={onClick || ((event) => event.stopPropagation())}
      className={`group absolute top-1 h-12 overflow-hidden rounded-lg border text-left text-xs shadow-sm transition hover:ring-2 ${colorClass}`}
      style={timelineBlockStyle(item, width, duration)}
    >
      <span
        role="presentation"
        onPointerDown={(event) => startEdit(event, "trim-left")}
        className="absolute bottom-0 left-0 top-0 z-10 w-3 cursor-ew-resize bg-white/10 opacity-0 transition hover:opacity-100"
      />
      <div className="h-full min-w-0 px-3 py-2">{children}</div>
      <span
        role="button"
        tabIndex={0}
        aria-label="Delete timeline item"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDelete(trackId, item.id);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          onDelete(trackId, item.id);
        }}
        className="absolute right-1 top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-black/45 text-[11px] font-semibold leading-none text-white/65 opacity-0 transition hover:bg-black/70 hover:text-white group-hover:opacity-100"
      >
        ×
      </span>
      <span
        role="presentation"
        onPointerDown={(event) => startEdit(event, "trim-right")}
        className="absolute bottom-0 right-0 top-0 z-10 w-3 cursor-ew-resize bg-white/10 opacity-0 transition hover:opacity-100"
      />
    </button>
  );
};

const startTimelinePointerEdit = ({
  event,
  item,
  mode,
  timelineDuration,
  trackWidth,
  minDuration,
  onChange,
}) => {
  event.preventDefault();
  event.stopPropagation();

  const startX = event.clientX;
  const originalStart = Number(item.start || 0);
  const originalDuration = Math.max(minDuration, Number(item.duration || minDuration));
  const originalEnd = originalStart + originalDuration;
  const originalTrimStart = Number(item.trimStart || 0);
  const canTrimSource = ["video", "audio", "bubble"].includes(item.kind);
  const secondsPerPixel = timelineDuration / trackWidth;

  const move = (moveEvent) => {
    const delta = (moveEvent.clientX - startX) * secondsPerPixel;
    if (mode === "trim-left") {
      const minStart = canTrimSource ? Math.max(0, originalStart - originalTrimStart) : 0;
      const nextStart = Math.max(
        minStart,
        Math.min(originalStart + delta, originalEnd - minDuration)
      );
      const patch = {
        start: roundTimelineValue(nextStart),
        duration: roundTimelineValue(originalEnd - nextStart),
      };
      if (canTrimSource) {
        patch.trimStart = roundTimelineValue(
          Math.max(0, originalTrimStart + nextStart - originalStart)
        );
      }
      onChange(patch);
      return;
    }
    if (mode === "trim-right") {
      onChange({
        duration: roundTimelineValue(Math.max(minDuration, originalDuration + delta)),
      });
      return;
    }
    onChange({ start: roundTimelineValue(Math.max(0, originalStart + delta)) });
  };

  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop, { once: true });
};

const roundTimelineValue = (value) => Math.round(Math.max(0, Number(value) || 0) * 100) / 100;

const timelineBlockStyle = (item, width, duration) => ({
  left: `${((Number(item.start || 0) / duration) * width).toFixed(2)}px`,
  width: `${Math.max(54, (Number(item.duration || 0.1) / duration) * width).toFixed(2)}px`,
});

const formatTime = (seconds) => {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const tenths = Math.floor((safeSeconds % 1) * 10);
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}.${tenths}`;
};

const normalizeColor = (value, fallback) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

const clampNumber = (value, min, max) =>
  Math.min(max, Math.max(min, Number(value) || min));

const EditorInspector = ({
  overlayItems,
  textItems,
  activeOverlay,
  activeText,
  voiceoverItems,
  avatarStatus,
  avatarGenerating,
  onSelectOverlay,
  onSelectText,
  onOverlayChange,
  onGenerateAvatar,
  onTextChange,
}) => (
  <aside className="flex w-96 shrink-0 flex-col overflow-hidden border-l border-white/5 bg-black/70 backdrop-blur-xl">
    <div className="border-b border-white/5 px-4 py-4">
      <h3 className="text-sm font-semibold text-white">Layers</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {overlayItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectOverlay(item.id)}
            className={`rounded-full border px-3 py-1.5 text-xs ${
              activeOverlay?.id === item.id
                ? "border-cyan-200/50 bg-cyan-300/20 text-cyan-50"
                : "border-white/10 bg-white/[0.03] text-white/50"
            }`}
          >
            Presenter
          </button>
        ))}
        {textItems.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectText(item.id)}
            className={`rounded-full border px-3 py-1.5 text-xs ${
              activeText?.id === item.id
                ? "border-white/30 bg-white/10 text-white"
                : "border-white/10 bg-white/[0.03] text-white/50"
            }`}
          >
            Text {index + 1}
          </button>
        ))}
      </div>
    </div>
    {activeOverlay ? (
      <BubblePanel
        item={activeOverlay}
        onChange={onOverlayChange}
        hasVoiceover={voiceoverItems.length > 0}
        avatarStatus={avatarStatus}
        avatarGenerating={avatarGenerating}
        onGenerateAvatar={onGenerateAvatar}
        embedded
      />
    ) : activeText ? (
      <TextPanel item={activeText} onChange={onTextChange} embedded />
    ) : (
      <div className="p-4 text-sm text-white/35">No editable layers</div>
    )}
  </aside>
);

const BubblePanel = ({
  item,
  onChange,
  hasVoiceover = false,
  avatarStatus,
  avatarGenerating = false,
  onGenerateAvatar,
  embedded = false,
}) => {
  const hasTalkingVideo = /\.(mp4|mov|webm)(\?|#|$)/i.test(item.sourceUrl || "");
  const isGenerating = avatarGenerating || avatarStatus === "generating";
  const content = (
    <>
      <div className="border-b border-white/5 px-4 py-4">
      <h3 className="text-sm font-semibold text-white">Presenter Bubble</h3>
    </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        {item.sourceUrl ? (
          <img
            src={item.sourceUrl}
            alt=""
            className="mx-auto aspect-square w-28 rounded-full object-cover ring-2 ring-white/70"
          />
        ) : null}
      </div>
      <button
        type="button"
        onClick={onGenerateAvatar}
        disabled={!hasVoiceover || isGenerating}
        className={`${ghostButtonClass} flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {isGenerating && (
          <span className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-white" />
        )}
        {isGenerating
          ? "Generating talking avatar..."
          : hasTalkingVideo
            ? "Regenerate talking avatar"
            : "Generate talking avatar"}
      </button>
      {!hasVoiceover && (
        <p className="text-xs text-white/35">
          Add a voiceover first so the presenter can lip-sync to it.
        </p>
      )}
      {avatarStatus === "failed" && (
        <p className="text-xs text-rose-300">
          Avatar generation failed. You can retry with the button above.
        </p>
      )}
      <div>
        <p className="mb-1 text-xs text-white/40">Shape</p>
        <select
          className={fieldClass}
          value={item.shape || "circle"}
          onChange={(e) => onChange({ shape: e.target.value })}
        >
          <option value="circle">Circle</option>
          <option value="rounded">Rounded square</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={item.x || 0} onChange={(x) => onChange({ x })} />
        <NumberField label="Y" value={item.y || 0} onChange={(y) => onChange({ y })} />
        <NumberField label="Width" value={item.width || 320} onChange={(width) => onChange({ width })} />
        <NumberField label="Height" value={item.height || 320} onChange={(height) => onChange({ height })} />
        <NumberField label="Start" value={item.start || 0} step="0.25" onChange={(start) => onChange({ start })} />
        <NumberField label="Duration" value={item.duration || 1} step="0.25" onChange={(duration) => onChange({ duration: Math.max(0.5, duration) })} />
      </div>
      <div>
        <p className="mb-1 text-xs text-white/40">Source URL</p>
        <input
          className={fieldClass}
          value={item.sourceUrl || ""}
          onChange={(e) => onChange({ sourceUrl: e.target.value })}
        />
      </div>
    </div>
    </>
  );
  return embedded ? (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{content}</div>
  ) : (
    <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-white/5 bg-black/70 backdrop-blur-xl">
      {content}
    </aside>
  );
};

const NumberField = ({ label, value, onChange, step = "1" }) => (
  <label className="block">
    <span className="mb-1 block text-xs text-white/40">{label}</span>
    <input
      type="number"
      step={step}
      className={fieldClass}
      value={Number(value || 0)}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  </label>
);

const ColorField = ({ label, value, fallback, onChange }) => (
  <label className="block">
    <span className="mb-1 block text-xs text-white/40">{label}</span>
    <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2">
      <input
        type="color"
        value={normalizeColor(value, fallback)}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-8 shrink-0 cursor-pointer border-0 bg-transparent p-0"
      />
      <span className="min-w-0 truncate font-mono text-xs text-white/55">
        {normalizeColor(value, fallback)}
      </span>
    </span>
  </label>
);

const TextPanel = ({ item, onChange, embedded = false }) => {
  const content = (
    <>
      <div className="border-b border-white/5 px-4 py-4">
      <h3 className="text-sm font-semibold text-white">Text Overlay</h3>
    </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
      <div>
        <p className="mb-1 text-xs text-white/40">Headline</p>
        <textarea
          className={`${textareaClass} h-20`}
          value={item.text || ""}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      </div>
      <div>
        <p className="mb-1 text-xs text-white/40">Kicker</p>
        <input
          className={fieldClass}
          value={item.kicker || ""}
          onChange={(e) => onChange({ kicker: e.target.value })}
        />
      </div>
      <div>
        <p className="mb-1 text-xs text-white/40">Position</p>
        <select
          className={fieldClass}
          value={item.position || "bottom-left"}
          onChange={(e) => onChange({ position: e.target.value })}
        >
          <option value="bottom-left">Bottom left</option>
          <option value="bottom-center">Bottom center</option>
          <option value="top-left">Top left</option>
        </select>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-white/35">
          Style
        </p>
        <div className="grid grid-cols-2 gap-2">
          {TEXT_STYLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() =>
                onChange({
                  styleVariant: preset.id,
                  fontSize: preset.id === "headline"
                    ? 86
                    : preset.id === "estate-spec"
                      ? 36
                      : item.fontSize || 40,
                })
              }
              className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                (item.styleVariant || "estate-lower") === preset.id
                  ? "border-white/30 bg-white/12 text-white"
                  : "border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.06]"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <NumberField
            label="Size"
            value={item.fontSize || (item.styleVariant === "headline" ? 86 : 40)}
            onChange={(fontSize) =>
              onChange({ fontSize: clampNumber(fontSize, 24, 132) })
            }
          />
          <label className="block">
            <span className="mb-1 block text-xs text-white/40">Motion</span>
            <select
              className={fieldClass}
              value={item.transition?.type || "slide-up"}
              onChange={(e) =>
                onChange({
                  transition: {
                    ...(item.transition || {}),
                    type: e.target.value,
                    duration: item.transition?.duration || 0.35,
                  },
                })
              }
            >
              <option value="none">None</option>
              <option value="fade">Fade</option>
              <option value="editorial-rise">Editorial rise</option>
              <option value="shimmer-rise">Shimmer rise</option>
              <option value="slide-up">Slide up</option>
              <option value="zoom">Zoom</option>
            </select>
          </label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <ColorField
            label="Text"
            value={item.textColor}
            fallback="#ffffff"
            onChange={(textColor) => onChange({ textColor })}
          />
          <ColorField
            label="Kicker"
            value={item.kickerColor}
            fallback="#d8d3c8"
            onChange={(kickerColor) => onChange({ kickerColor })}
          />
          <ColorField
            label="Accent"
            value={item.accentColor}
            fallback="#d7c6a0"
            onChange={(accentColor) => onChange({ accentColor })}
          />
          <ColorField
            label="Panel"
            value={item.backgroundColor}
            fallback="#101216"
            onChange={(backgroundColor) => onChange({ backgroundColor })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="mb-1 text-xs text-white/40">Start</p>
          <input
            type="number"
            step="0.25"
            className={fieldClass}
            value={Number(item.start || 0).toFixed(2)}
            onChange={(e) => onChange({ start: Number(e.target.value) || 0 })}
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-white/40">Duration</p>
          <input
            type="number"
            min="0.5"
            step="0.25"
            className={fieldClass}
            value={Number(item.duration || 1).toFixed(2)}
            onChange={(e) =>
              onChange({ duration: Math.max(0.5, Number(e.target.value) || 0.5) })
            }
          />
        </div>
      </div>
    </div>
    </>
  );
  return embedded ? (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{content}</div>
  ) : (
    <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-white/5 bg-black/70 backdrop-blur-xl">
      {content}
    </aside>
  );
};

// ═══════════════════════════════════════════════════
// CLIP TIMELINE
// ═══════════════════════════════════════════════════
const ClipTimeline = ({ project, clips, selectedClip, onSelect }) => (
  <div className="border-t border-white/5 bg-black/70 px-4 py-3 backdrop-blur-xl">
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {clips.map((clip, i) => {
        const isDone = clip.videoJob?.status === "completed";
        const isFailed =
          clip.imageJob?.status === "failed" ||
          clip.videoJob?.status === "failed";
        const isWorking =
          clip.imageJob?.status === "processing" ||
          clip.videoJob?.status === "processing";

        return (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className={`relative aspect-video w-28 shrink-0 overflow-hidden rounded-xl border transition-all hover:opacity-100 ${
              selectedClip === i
                ? "border-white/70 ring-1 ring-white/30"
                : isDone
                  ? "border-emerald-400/35 opacity-90"
                  : isFailed
                    ? "border-rose-400/35 opacity-50"
                    : "border-white/5 opacity-60"
            }`}
          >
            {clip.transformedImageUrl || clip.sourceImageUrl ? (
              <img
                src={clip.transformedImageUrl || clip.sourceImageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-white/5" />
            )}
            {isWorking && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              </div>
            )}
            <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white ring-1 ring-white/10">
              {i + 1}
            </span>
            <StatusDot
              status={
                isDone
                  ? "completed"
                  : isFailed
                    ? "failed"
                    : isWorking
                      ? "generating"
                      : "draft"
              }
              className="absolute top-1 right-1"
            />
          </button>
        );
      })}
      {project.generationOptions?.presenter?.enabled && (
        <AvatarAssetTile project={project} />
      )}
    </div>
  </div>
);

const AvatarAssetTile = ({ project }) => {
  const presenterId = project.generationOptions?.presenter?.presenterId || "male-1";
  const avatarStatus = project.editorState?.avatar?.status;
  const isWorking =
    avatarStatus === "generating" ||
    (project.status === "assembling" && avatarStatus !== "rendered");
  const isDone = avatarStatus === "rendered";
  const isFailed = avatarStatus === "failed";

  return (
    <div
      className={`relative aspect-video w-28 shrink-0 overflow-hidden rounded-xl border transition-all ${
        isDone
          ? "border-cyan-300/40 opacity-90"
          : isFailed
            ? "border-rose-400/35 opacity-60"
            : isWorking
              ? "border-cyan-300/25 opacity-80"
              : "border-white/5 opacity-60"
      }`}
      title="Talking avatar"
    >
      <img
        src={`/samples/presenters/${presenterId}.jpg`}
        alt=""
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1 pt-5 text-left">
        <span className="block truncate text-[10px] font-medium text-white">
          Avatar
        </span>
      </div>
      {isWorking && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      )}
      <span className="absolute bottom-1 left-1 rounded-full bg-cyan-400/20 px-1.5 py-0.5 font-mono text-[10px] text-cyan-100 ring-1 ring-cyan-300/20">
        A
      </span>
      <StatusDot
        status={
          isDone
            ? "completed"
            : isFailed
              ? "failed"
              : isWorking
                ? "generating"
                : "draft"
        }
        className="absolute right-1 top-1"
      />
    </div>
  );
};

// ═══════════════════════════════════════════════════
// CLIP PANEL — Right side detail
// ═══════════════════════════════════════════════════
const ClipPanel = ({ clip, index, onClose }) => (
  <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-white/5 bg-black/70 backdrop-blur-xl">
    <div className="flex items-center justify-between border-b border-white/5 px-4 py-4">
      <h3 className="text-sm font-semibold text-white">Clip {index + 1}</h3>
      <button
        onClick={onClose}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
      >
        ✕
      </button>
    </div>
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {/* Source */}
      {clip.sourceImageUrl && (
        <div>
          <p className="mb-1 text-xs text-white/40">Original</p>
          <img
            src={clip.sourceImageUrl}
            alt=""
            className="aspect-video w-full rounded-xl border border-white/5 object-cover"
          />
        </div>
      )}
      {/* Transformed */}
      {clip.transformedImageUrl && (
        <div>
          <p className="mb-1 text-xs text-white/40">Transformed</p>
          <img
            src={clip.transformedImageUrl}
            alt=""
            className="aspect-video w-full rounded-xl border border-white/5 object-cover"
          />
        </div>
      )}
      {/* Video */}
      {clip.videoUrl && (
        <div>
          <p className="mb-1 text-xs text-white/40">Video</p>
          <video
            src={clip.videoUrl}
            controls
            muted
            loop
            className="w-full rounded-xl border border-white/5"
          />
        </div>
      )}
      {/* Status */}
      <div className="space-y-1 border-t border-white/5 pt-3 text-xs">
        <div className="flex justify-between">
          <span className="text-white/40">Transform</span>
          <StatusLabel status={clip.imageJob?.status} />
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">Video</span>
          <StatusLabel status={clip.videoJob?.status} />
        </div>
        {(clip.imageJob?.error || clip.videoJob?.error) && (
          <p className="mt-1 text-xs text-rose-300">
            {clip.imageJob?.error || clip.videoJob?.error}
          </p>
        )}
      </div>
    </div>
  </aside>
);

// ═══════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════

const OptionToggle = ({ label, icon, active, disabled = false, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`${optionButtonClass} ${
      active
        ? "border-white/25 bg-white/[0.09] text-white"
        : "border-white/5 bg-white/[0.03] text-white/45 hover:border-white/12 hover:bg-white/[0.05]"
    } ${disabled ? "cursor-not-allowed opacity-40 hover:border-white/5 hover:bg-white/[0.03]" : ""}`}
  >
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
        active ? "bg-white text-black" : "bg-white/10 text-white/50"
      }`}
    >
      {icon}
    </span>
    <span className="min-w-0 text-sm font-medium">{label}</span>
  </button>
);

const EmptyState = () => (
  <div className="flex flex-1 items-center justify-center px-6">
    <div className="max-w-md text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Video Studio
      </span>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">
        Select a project or create a new one
      </h1>
      <p className="mt-3 text-sm text-white/45">
        Upload photos, choose a creator style, and let the Trigger pipeline build the edit.
      </p>
    </div>
  </div>
);

const ProcessingState = ({ project, completedClips }) => {
  const labels = {
    classifying: "Classifying photos...",
    generating: "Generating clips...",
    assembling: "Assembling video...",
    rendering: "Rendering final video...",
  };
  return (
    <div className="space-y-4 text-center">
      <div className="relative w-24 h-24 mx-auto">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r="42" fill="none"
            stroke="currentColor" strokeWidth="6"
            className="text-white/10"
          />
          <circle
            cx="50" cy="50" r="42" fill="none"
            stroke="currentColor" strokeWidth="6"
            strokeDasharray={`${(project.progress / 100) * 264} 264`}
            strokeLinecap="round"
            className="text-white transition-all duration-500"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-lg font-bold text-white">
          {project.progress}%
        </span>
      </div>
      <p className="text-white/60">
        {labels[project.status] || "Processing..."}
      </p>
      {project.clips?.length > 0 && (
        <p className="text-sm text-white/30">
          {completedClips.length}/{project.clips.length} clips done
        </p>
      )}
    </div>
  );
};

const StatusBadge = ({ status }) => {
  const map = {
    completed: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    editing: "border-violet-400/20 bg-violet-400/10 text-violet-200",
    rendering: "border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200",
    failed: "border-rose-400/20 bg-rose-400/10 text-rose-200",
    classifying: "border-sky-400/20 bg-sky-400/10 text-sky-200",
    generating: "border-amber-400/20 bg-amber-400/10 text-amber-200",
    assembling: "border-sky-400/20 bg-sky-400/10 text-sky-200",
  };
  const spin = ["generating", "classifying", "assembling", "rendering"].includes(status);
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${map[status] || "border-white/10 bg-white/5 text-white/60"}`}>
      {spin && <span className="mr-1.5 h-3 w-3 animate-spin rounded-full border border-current/20 border-t-current" />}
      {status}
    </span>
  );
};

const StatusDot = ({ status, className = "" }) => {
  const colors = {
    completed: "bg-emerald-400",
    editing: "bg-violet-300",
    rendering: "bg-fuchsia-300 animate-pulse",
    failed: "bg-rose-400",
    generating: "bg-amber-300 animate-pulse",
    classifying: "bg-sky-300 animate-pulse",
    assembling: "bg-sky-300 animate-pulse",
  };
  return (
    <span
      className={`h-2 w-2 rounded-full ${colors[status] || "bg-white/20"} ${className}`}
    />
  );
};

const StatusLabel = ({ status }) => {
  const colors = {
    completed: "text-emerald-300",
    failed: "text-rose-300",
    processing: "text-amber-300",
  };
  return (
    <span className={colors[status] || "text-white/30"}>
      {status || "pending"}
    </span>
  );
};

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

export default ProjectsPage;
