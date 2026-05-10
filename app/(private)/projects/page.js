"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import apiClient from "@/libs/api";
import { uploadFilesToR2 } from "@/helpers/uploadToR2";

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
    fetchProjects();
    pollingRef.current = setInterval(fetchProjects, 8000);
    return () => clearInterval(pollingRef.current);
  }, [fetchProjects]);

  const selectedProject = projects.find((p) => p._id === selectedId) || null;

  const onProjectCreated = (projectId) => {
    setSelectedId(projectId);
    fetchProjects();
  };

  return (
    <div className="flex h-screen bg-base-300 overflow-hidden">
      {/* ═══ LEFT SIDEBAR — Create + List ═══ */}
      <Sidebar
        projects={projects}
        loading={loading}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onProjectCreated={onProjectCreated}
      />

      {/* ═══ MAIN AREA — Selected project or empty state ═══ */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
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
    <aside className="w-80 bg-base-200 border-r border-base-content/5 flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-base-content/5 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold">
          AutoVideo
        </Link>
        <button
          className={`btn btn-sm ${showCreate ? "btn-ghost" : "btn-primary"}`}
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
              <span className="loading loading-spinner" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12 px-4">
              <p className="text-base-content/40 text-sm">
                No projects yet
              </p>
              <button
                className="btn btn-primary btn-sm mt-3"
                onClick={() => setShowCreate(true)}
              >
                Create your first video
              </button>
            </div>
          ) : (
            <div className="py-1">
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
      className={`w-full text-left px-4 py-3 transition-colors border-l-2 ${
        isSelected
          ? "bg-base-300 border-primary"
          : "border-transparent hover:bg-base-300/50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">
            {project.propertyInfo?.address || project.name}
          </p>
          <p className="text-xs text-base-content/40 mt-0.5">
            {project.clips?.length || 0} clips
            {project.propertyInfo?.price
              ? ` · ${project.propertyInfo.price}`
              : ""}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {isProcessing && (
            <span className="loading loading-spinner loading-xs text-warning" />
          )}
          <StatusDot status={project.status} />
        </div>
      </div>

      {isProcessing && (
        <progress
          className="progress progress-primary w-full h-1 mt-2"
          value={project.progress}
          max="100"
        />
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
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Photos */}
      <div>
        <h3 className="text-xs font-medium uppercase tracking-wider text-base-content/40 mb-2">
          Photos
        </h3>
        <div
          className="border border-dashed border-base-content/20 rounded-lg p-3 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDrop={(e) => {
            e.preventDefault();
            addPhotos(e.dataTransfer.files);
          }}
          onDragOver={(e) => e.preventDefault()}
        >
          <p className="text-xs text-base-content/40">
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
          <div className="grid grid-cols-4 gap-1 mt-2">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group aspect-square">
                <img
                  src={photo.preview}
                  alt=""
                  className="w-full h-full object-cover rounded"
                />
                <button
                  onClick={() => removePhoto(photo.id)}
                  className="absolute top-0.5 right-0.5 w-4 h-4 bg-error text-error-content rounded-full text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
          <h3 className="text-xs font-medium uppercase tracking-wider text-base-content/40 mb-2">
            Style
          </h3>
          <select
            className="select select-bordered select-sm w-full"
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
        <h3 className="text-xs font-medium uppercase tracking-wider text-base-content/40">
          Property Info
        </h3>
        <input
          type="text"
          placeholder="Address"
          className="input input-bordered input-sm w-full"
          value={propertyInfo.address}
          onChange={handleChange("address")}
        />
        <input
          type="text"
          placeholder="Price"
          className="input input-bordered input-sm w-full"
          value={propertyInfo.price}
          onChange={handleChange("price")}
        />
        <textarea
          placeholder="Description (beds, baths, sqft, features...)"
          className="textarea textarea-bordered textarea-sm w-full h-16 text-sm"
          value={propertyInfo.description}
          onChange={handleChange("description")}
        />
      </div>

      {/* Narration notes */}
      <div>
        <h3 className="text-xs font-medium uppercase tracking-wider text-base-content/40 mb-1">
          Narration Notes{" "}
          <span className="font-normal text-base-content/30">(optional)</span>
        </h3>
        <textarea
          placeholder={"Things to mention in voiceover:\n• Great BBQ area\n• Walking distance to downtown\n• Italian marble kitchen"}
          className="textarea textarea-bordered textarea-sm w-full h-20 text-sm"
          value={propertyInfo.narrationNotes}
          onChange={handleChange("narrationNotes")}
        />
        <p className="text-[10px] text-base-content/30 mt-0.5">
          Combined with features detected in your photos
        </p>
      </div>

      {/* Generate button */}
      <button
        className={`btn btn-primary w-full ${phase !== "idle" ? "btn-disabled" : ""}`}
        onClick={handleSubmit}
        disabled={!canSubmit}
      >
        {phase === "uploading" ? (
          <>
            <span className="loading loading-spinner loading-xs" />
            Uploading...
          </>
        ) : phase === "creating" ? (
          <>
            <span className="loading loading-spinner loading-xs" />
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
      <div className="flex items-center justify-between px-6 py-3 bg-base-200 border-b border-base-content/5">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold truncate">
            {project.propertyInfo?.address || project.name}
          </h1>
          {project.propertyInfo?.price && (
            <p className="text-xs text-base-content/40">
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
              className="btn btn-primary btn-sm gap-1"
            >
              <DownloadIcon />
              Export
            </a>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Video preview */}
        <div className="flex-1 flex items-center justify-center p-6">
          {project.finalVideoUrl ? (
            <video
              src={project.finalVideoUrl}
              controls
              autoPlay
              className="max-w-full max-h-full rounded-lg shadow-2xl"
              style={{ aspectRatio: "16/9" }}
            />
          ) : isProcessing ? (
            <ProcessingState
              project={project}
              completedClips={completedClips}
            />
          ) : project.status === "failed" ? (
            <div className="text-center space-y-2">
              <div className="text-error text-4xl">!</div>
              <p className="text-error font-medium">Generation failed</p>
            </div>
          ) : (
            <p className="text-base-content/30">No video yet</p>
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
  <div className="bg-base-200 border-t border-base-content/5 px-4 py-3">
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
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
            className={`relative shrink-0 w-28 aspect-video rounded-md overflow-hidden border-2 transition-all hover:opacity-100 ${
              selectedClip === i
                ? "border-primary ring-1 ring-primary/30"
                : isDone
                  ? "border-success/30 opacity-90"
                  : isFailed
                    ? "border-error/30 opacity-50"
                    : "border-transparent opacity-60"
            }`}
          >
            {clip.transformedImageUrl || clip.sourceImageUrl ? (
              <img
                src={clip.transformedImageUrl || clip.sourceImageUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-base-300" />
            )}
            {isWorking && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="loading loading-spinner loading-sm text-white" />
              </div>
            )}
            <span className="absolute bottom-0.5 left-1 text-[10px] text-white font-mono bg-black/60 px-1 rounded">
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
  <aside className="w-72 bg-base-200 border-l border-base-content/5 flex flex-col overflow-hidden shrink-0">
    <div className="flex items-center justify-between px-4 py-3 border-b border-base-content/5">
      <h3 className="font-semibold text-sm">Clip {index + 1}</h3>
      <button onClick={onClose} className="btn btn-ghost btn-xs btn-square">
        ✕
      </button>
    </div>
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {/* Source */}
      {clip.sourceImageUrl && (
        <div>
          <p className="text-xs text-base-content/40 mb-1">Original</p>
          <img
            src={clip.sourceImageUrl}
            alt=""
            className="w-full aspect-video object-cover rounded-md"
          />
        </div>
      )}
      {/* Transformed */}
      {clip.transformedImageUrl && (
        <div>
          <p className="text-xs text-base-content/40 mb-1">Transformed</p>
          <img
            src={clip.transformedImageUrl}
            alt=""
            className="w-full aspect-video object-cover rounded-md"
          />
        </div>
      )}
      {/* Video */}
      {clip.videoUrl && (
        <div>
          <p className="text-xs text-base-content/40 mb-1">Video</p>
          <video
            src={clip.videoUrl}
            controls
            muted
            loop
            className="w-full rounded-md"
          />
        </div>
      )}
      {/* Status */}
      <div className="space-y-1 text-xs pt-2 border-t border-base-content/5">
        <div className="flex justify-between">
          <span className="text-base-content/40">Transform</span>
          <StatusLabel status={clip.imageJob?.status} />
        </div>
        <div className="flex justify-between">
          <span className="text-base-content/40">Video</span>
          <StatusLabel status={clip.videoJob?.status} />
        </div>
        {(clip.imageJob?.error || clip.videoJob?.error) && (
          <p className="text-error text-xs mt-1">
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
  <div className="flex-1 flex items-center justify-center">
    <div className="text-center">
      <p className="text-base-content/30 text-lg">
        Select a project or create a new one
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
    <div className="text-center space-y-4">
      <div className="relative w-24 h-24 mx-auto">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r="42" fill="none"
            stroke="currentColor" strokeWidth="6"
            className="text-base-content/10"
          />
          <circle
            cx="50" cy="50" r="42" fill="none"
            stroke="currentColor" strokeWidth="6"
            strokeDasharray={`${(project.progress / 100) * 264} 264`}
            strokeLinecap="round"
            className="text-primary transition-all duration-500"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-lg font-mono font-bold">
          {project.progress}%
        </span>
      </div>
      <p className="text-base-content/60">
        {labels[project.status] || "Processing..."}
      </p>
      {project.clips?.length > 0 && (
        <p className="text-sm text-base-content/30">
          {completedClips.length}/{project.clips.length} clips done
        </p>
      )}
    </div>
  );
};

const StatusBadge = ({ status }) => {
  const map = {
    completed: "badge-success",
    failed: "badge-error",
    classifying: "badge-info",
    generating: "badge-warning",
    assembling: "badge-info",
  };
  const spin = ["generating", "classifying", "assembling"].includes(status);
  return (
    <span className={`badge ${map[status] || "badge-ghost"}`}>
      {spin && <span className="loading loading-spinner loading-xs mr-1" />}
      {status}
    </span>
  );
};

const StatusDot = ({ status, className = "" }) => {
  const colors = {
    completed: "bg-success",
    failed: "bg-error",
    generating: "bg-warning animate-pulse",
    classifying: "bg-info animate-pulse",
    assembling: "bg-info animate-pulse",
  };
  return (
    <span
      className={`w-2 h-2 rounded-full ${colors[status] || "bg-base-content/20"} ${className}`}
    />
  );
};

const StatusLabel = ({ status }) => {
  const colors = {
    completed: "text-success",
    failed: "text-error",
    processing: "text-warning",
  };
  return (
    <span className={colors[status] || "text-base-content/30"}>
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
