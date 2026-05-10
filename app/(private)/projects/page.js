"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import apiClient from "@/libs/api";
import { uploadFilesToR2 } from "@/helpers/uploadToR2";

const fieldClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-white/25 focus:bg-white/[0.06]";
const textareaClass = `${fieldClass} resize-none`;
const labelClass = "mb-2 text-xs font-medium uppercase tracking-wider text-white/40";
const pillButtonClass =
  "rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-black/50";
const ghostButtonClass =
  "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white";

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
  const isProcessing = ["generating", "classifying", "assembling"].includes(
    project.status
  );

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
            {project.propertyInfo?.address || project.name}
          </p>
          <p className="mt-0.5 text-xs text-white/45">
            {project.clips?.length || 0} clips
            {project.propertyInfo?.price
              ? ` · ${project.propertyInfo.price}`
              : ""}
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
    address: "",
    price: "",
    description: "",
    narrationNotes: "",
  });
  const [phase, setPhase] = useState("idle"); // idle | uploading | creating
  const [styles, setStyles] = useState([]);
  const [styleId, setStyleId] = useState(null);
  const [loadingStyles, setLoadingStyles] = useState(true);

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

  return (
    <div className="flex-1 space-y-5 overflow-y-auto p-4">
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

      {/* Property info */}
      <div className="space-y-2">
        <h3 className={labelClass}>Property Info</h3>
        <input
          type="text"
          placeholder="Address"
          className={fieldClass}
          value={propertyInfo.address}
          onChange={handleChange("address")}
        />
        <input
          type="text"
          placeholder="Price"
          className={fieldClass}
          value={propertyInfo.price}
          onChange={handleChange("price")}
        />
        <textarea
          placeholder="Description (beds, baths, sqft, features...)"
          className={`${textareaClass} h-20`}
          value={propertyInfo.description}
          onChange={handleChange("description")}
        />
      </div>

      {/* Narration notes */}
      <div>
        <h3 className={labelClass}>
          Narration Notes{" "}
          <span className="font-normal text-white/30">(optional)</span>
        </h3>
        <textarea
          placeholder={"Things to mention in voiceover:\n• Great BBQ area\n• Walking distance to downtown\n• Italian marble kitchen"}
          className={`${textareaClass} h-24`}
          value={propertyInfo.narrationNotes}
          onChange={handleChange("narrationNotes")}
        />
        <p className="mt-1 text-[10px] text-white/30">
          Combined with features detected in your photos
        </p>
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
    </div>
  );
};

// ═══════════════════════════════════════════════════
// PROJECT DETAIL — Main area when a project is selected
// ═══════════════════════════════════════════════════
const ProjectDetail = ({ project }) => {
  const [selectedClip, setSelectedClip] = useState(null);

  const isProcessing = ["generating", "classifying", "assembling"].includes(
    project.status
  );
  const completedClips =
    project.clips?.filter((c) => c.videoJob?.status === "completed") || [];

  return (
    <>
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/5 bg-black/50 px-6 py-4 backdrop-blur-xl">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-white">
            {project.propertyInfo?.address || project.name}
          </h1>
          {project.propertyInfo?.price && (
            <p className="text-xs text-white/45">
              {project.propertyInfo.price}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={project.status} />
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
          {project.finalVideoUrl ? (
            <video
              src={project.finalVideoUrl}
              controls
              autoPlay
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
        {selectedClip !== null && project.clips?.[selectedClip] && (
          <ClipPanel
            clip={project.clips[selectedClip]}
            index={selectedClip}
            onClose={() => setSelectedClip(null)}
          />
        )}
      </div>

      {/* Bottom timeline */}
      {project.clips?.length > 0 && (
        <ClipTimeline
          clips={project.clips}
          selectedClip={selectedClip}
          onSelect={(i) => setSelectedClip(selectedClip === i ? null : i)}
        />
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════
// CLIP TIMELINE
// ═══════════════════════════════════════════════════
const ClipTimeline = ({ clips, selectedClip, onSelect }) => (
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
    </div>
  </div>
);

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
    failed: "border-rose-400/20 bg-rose-400/10 text-rose-200",
    classifying: "border-sky-400/20 bg-sky-400/10 text-sky-200",
    generating: "border-amber-400/20 bg-amber-400/10 text-amber-200",
    assembling: "border-sky-400/20 bg-sky-400/10 text-sky-200",
  };
  const spin = ["generating", "classifying", "assembling"].includes(status);
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
