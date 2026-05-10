"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import apiClient from "@/libs/api";

const ProjectPage = () => {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedClip, setSelectedClip] = useState(null);
  const pollingRef = useRef(null);

  useEffect(() => {
    const pollStatus = async () => {
      try {
        const data = await apiClient.get(`/projects/${id}`);
        setProject(data);
        if (["completed", "failed"].includes(data.status) && pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      } catch {}
    };

    const fetchProject = async () => {
      try {
        const data = await apiClient.get(`/projects/${id}`);
        setProject(data);
        setLoading(false);

        if (
          ["generating", "classifying", "assembling"].includes(data.status) &&
          !pollingRef.current
        ) {
          pollingRef.current = setInterval(() => pollStatus(), 5000);
        }
        if (["completed", "failed"].includes(data.status) && pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      } catch {
        setLoading(false);
      }
    };

    const initialFetch = setTimeout(fetchProject, 0);
    return () => {
      clearTimeout(initialFetch);
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-base-300">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-base-300 gap-4">
        <p className="text-base-content/50">Project not found</p>
        <Link href="/projects" className="btn btn-ghost btn-sm">
          Back to projects
        </Link>
      </div>
    );
  }

  const isProcessing = ["generating", "classifying", "assembling"].includes(
    project.status
  );
  const completedClips =
    project.clips?.filter((c) => c.videoJob?.status === "completed") || [];

  return (
    <div className="flex h-screen bg-base-300 overflow-hidden">
      {/* ═══ LEFT SIDEBAR ═══ */}
      <LeftSidebar project={project} />

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-base-200 border-b border-base-content/5">
          <h1 className="text-lg font-semibold truncate">
            {project.propertyInfo?.address || project.name}
          </h1>
          <div className="flex items-center gap-3">
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
                Export Video
              </a>
            )}
          </div>
        </div>

        {/* Video preview area */}
        <div className="flex-1 flex items-center justify-center p-6 min-h-0">
          {project.finalVideoUrl ? (
            <video
              src={project.finalVideoUrl}
              controls
              autoPlay
              className="max-w-full max-h-full rounded-lg shadow-2xl"
              style={{ aspectRatio: "16/9" }}
            />
          ) : isProcessing ? (
            <ProcessingState project={project} completedClips={completedClips} />
          ) : project.status === "failed" ? (
            <FailedState />
          ) : (
            <div className="text-base-content/30 text-center">
              <p className="text-lg">No video yet</p>
            </div>
          )}
        </div>

        {/* Bottom timeline strip */}
        {project.clips?.length > 0 && (
          <ClipTimeline
            clips={project.clips}
            selectedClip={selectedClip}
            onSelect={setSelectedClip}
          />
        )}
      </main>

      {/* ═══ RIGHT PANEL (clip details) ═══ */}
      {selectedClip !== null && project.clips?.[selectedClip] && (
        <RightPanel
          clip={project.clips[selectedClip]}
          index={selectedClip}
          onClose={() => setSelectedClip(null)}
        />
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════
// LEFT SIDEBAR — Photos + Project Info
// ═══════════════════════════════════════════════════
const LeftSidebar = ({ project }) => {
  return (
    <aside className="w-72 bg-base-200 border-r border-base-content/5 flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-base-content/5">
        <Link
          href="/projects"
          className="text-xs text-base-content/40 hover:text-base-content transition-colors"
        >
          &larr; All Projects
        </Link>
      </div>

      {/* Photos grid */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-base-content/40 mb-2">
            Photos ({project.sourceImages?.length || 0})
          </h3>
          <div className="grid grid-cols-3 gap-1.5">
            {project.sourceImages?.map((img, i) => (
              <div key={i} className="relative group">
                <img
                  src={img.url}
                  alt=""
                  className="w-full aspect-square object-cover rounded-md"
                />
                {img.classification && img.classification !== "unassigned" && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-end p-1">
                    <span className="text-white text-[9px] leading-tight">
                      {img.classification.replace(/_/g, " ")}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Property info */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-base-content/40">
            Property Info
          </h3>

          {project.propertyInfo?.address && (
            <div>
              <label className="text-xs text-base-content/40">Address</label>
              <p className="text-sm">{project.propertyInfo.address}</p>
            </div>
          )}

          {project.propertyInfo?.price && (
            <div>
              <label className="text-xs text-base-content/40">Price</label>
              <p className="text-sm font-medium">
                {project.propertyInfo.price}
              </p>
            </div>
          )}

          {project.propertyInfo?.description && (
            <div>
              <label className="text-xs text-base-content/40">
                Description
              </label>
              <p className="text-xs text-base-content/60 line-clamp-4">
                {project.propertyInfo.description}
              </p>
            </div>
          )}
        </div>

        {/* Style info */}
        {project.style && (
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-base-content/40 mb-1">
              Style
            </h3>
            <p className="text-sm">{project.style.name || "Cinematic Pro"}</p>
          </div>
        )}
      </div>

      {/* Bottom: new project button */}
      <div className="p-4 border-t border-base-content/5">
        <Link href="/projects" className="btn btn-sm btn-ghost w-full">
          + New Project
        </Link>
      </div>
    </aside>
  );
};

// ═══════════════════════════════════════════════════
// CLIP TIMELINE — Bottom strip with thumbnails
// ═══════════════════════════════════════════════════
const ClipTimeline = ({ clips, selectedClip, onSelect }) => {
  return (
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
          const isSelected = selectedClip === i;

          return (
            <button
              key={i}
              onClick={() => onSelect(isSelected ? null : i)}
              className={`relative shrink-0 w-28 aspect-video rounded-md overflow-hidden border-2 transition-all hover:opacity-100 ${
                isSelected
                  ? "border-primary ring-1 ring-primary/30"
                  : isDone
                    ? "border-success/30 opacity-90"
                    : isFailed
                      ? "border-error/30 opacity-50"
                      : "border-transparent opacity-60"
              }`}
            >
              {/* Thumbnail */}
              {clip.transformedImageUrl || clip.sourceImageUrl ? (
                <img
                  src={clip.transformedImageUrl || clip.sourceImageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-base-300" />
              )}

              {/* Processing overlay */}
              {isWorking && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="loading loading-spinner loading-sm text-white" />
                </div>
              )}

              {/* Clip number */}
              <span className="absolute bottom-0.5 left-1 text-[10px] text-white font-mono bg-black/60 px-1 rounded">
                {i + 1}
              </span>

              {/* Status dot */}
              <span
                className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                  isDone
                    ? "bg-success"
                    : isFailed
                      ? "bg-error"
                      : isWorking
                        ? "bg-warning animate-pulse"
                        : "bg-base-content/20"
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════
// RIGHT PANEL — Clip details
// ═══════════════════════════════════════════════════
const RightPanel = ({ clip, index, onClose }) => {
  return (
    <aside className="w-80 bg-base-200 border-l border-base-content/5 flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-base-content/5">
        <h3 className="font-semibold text-sm">Clip {index + 1}</h3>
        <button
          onClick={onClose}
          className="btn btn-ghost btn-xs btn-square"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Transformation History */}
        <div>
          <h4 className="text-xs font-medium uppercase tracking-wider text-base-content/40 mb-2">
            Transformation History
          </h4>
          <div className="space-y-2">
            {/* Original */}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-base-content/30" />
              <span className="text-xs text-base-content/50">Original</span>
            </div>
            {clip.sourceImageUrl && (
              <img
                src={clip.sourceImageUrl}
                alt="Source"
                className="w-full aspect-video object-cover rounded-md"
              />
            )}

            {/* Transformed */}
            {clip.transformedImageUrl && (
              <>
                <div className="flex items-center gap-2 mt-3">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-xs text-base-content/50">
                    Transformed
                  </span>
                </div>
                <img
                  src={clip.transformedImageUrl}
                  alt="Transformed"
                  className="w-full aspect-video object-cover rounded-md"
                />
              </>
            )}

            {/* Multi-pass intermediates */}
            {clip.transformPasses?.length > 1 &&
              clip.transformPasses.map((pass, pi) =>
                pass.outputImageUrl ? (
                  <div key={pi}>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="w-2 h-2 rounded-full bg-info" />
                      <span className="text-xs text-base-content/50">
                        Pass {pi + 1}
                      </span>
                    </div>
                    <img
                      src={pass.outputImageUrl}
                      alt={`Pass ${pi + 1}`}
                      className="w-full aspect-video object-cover rounded-md"
                    />
                  </div>
                ) : null
              )}
          </div>
        </div>

        {/* Video result */}
        {clip.videoUrl && (
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wider text-base-content/40 mb-2">
              Generated Video
            </h4>
            <video
              src={clip.videoUrl}
              controls
              muted
              loop
              className="w-full rounded-md"
            />
          </div>
        )}

        {/* Status details */}
        <div>
          <h4 className="text-xs font-medium uppercase tracking-wider text-base-content/40 mb-2">
            Status
          </h4>
          <div className="space-y-1 text-xs">
            <StatusRow
              label="Image Transform"
              status={clip.imageJob?.status}
            />
            <StatusRow label="Video Generation" status={clip.videoJob?.status} />
          </div>

          {(clip.imageJob?.error || clip.videoJob?.error) && (
            <p className="text-xs text-error mt-2">
              {clip.imageJob?.error || clip.videoJob?.error}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
};

// ═══════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════

const ProcessingState = ({ project, completedClips }) => {
  const stepLabel = {
    classifying: "Classifying photos & matching to style...",
    generating: "Generating video clips...",
    assembling: "Assembling final video...",
  };

  return (
    <div className="text-center space-y-4">
      <div className="relative w-24 h-24 mx-auto">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-base-content/10"
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeDasharray={`${(project.progress / 100) * 264} 264`}
            strokeLinecap="round"
            className="text-primary transition-all duration-500"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-lg font-mono font-bold">
          {project.progress}%
        </span>
      </div>
      <div>
        <p className="text-base-content/60">
          {stepLabel[project.status] || "Processing..."}
        </p>
        {project.clips?.length > 0 && (
          <p className="text-sm text-base-content/30 mt-1">
            {completedClips.length} of {project.clips.length} clips completed
          </p>
        )}
      </div>
    </div>
  );
};

const FailedState = () => (
  <div className="text-center space-y-3">
    <div className="text-error text-5xl">!</div>
    <p className="text-error font-medium">Generation failed</p>
    <Link href="/projects" className="btn btn-sm btn-primary">
      Try Again
    </Link>
  </div>
);

const StatusBadge = ({ status }) => {
  const config = {
    completed: { cls: "badge-success", label: "Completed" },
    failed: { cls: "badge-error", label: "Failed" },
    classifying: { cls: "badge-info", label: "Classifying" },
    generating: { cls: "badge-warning", label: "Generating" },
    assembling: { cls: "badge-info", label: "Assembling" },
    draft: { cls: "badge-ghost", label: "Draft" },
  };
  const c = config[status] || { cls: "badge-ghost", label: status };
  const spin = ["generating", "classifying", "assembling"].includes(status);

  return (
    <span className={`badge ${c.cls}`}>
      {spin && <span className="loading loading-spinner loading-xs mr-1" />}
      {c.label}
    </span>
  );
};

const StatusRow = ({ label, status }) => {
  const colors = {
    completed: "text-success",
    failed: "text-error",
    processing: "text-warning",
    pending: "text-base-content/30",
  };
  return (
    <div className="flex items-center justify-between">
      <span className="text-base-content/50">{label}</span>
      <span className={colors[status] || "text-base-content/30"}>
        {status || "pending"}
      </span>
    </div>
  );
};

const DownloadIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
    />
  </svg>
);

export default ProjectPage;
