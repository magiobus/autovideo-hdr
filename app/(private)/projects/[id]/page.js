"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import apiClient from "@/libs/api";

const ProjectPage = () => {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef(null);

  useEffect(() => {
    // Initial fetch
    fetchProject();

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [id]);

  const fetchProject = async () => {
    try {
      const data = await apiClient.get(`/projects/${id}`);
      setProject(data);
      setLoading(false);

      // Start polling if still processing
      if (
        ["generating", "classifying", "assembling"].includes(data.status) &&
        !pollingRef.current
      ) {
        pollingRef.current = setInterval(() => pollStatus(), 5000);
      }

      // Stop polling if done
      if (["completed", "failed"].includes(data.status) && pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    } catch {
      setLoading(false);
    }
  };

  const pollStatus = async () => {
    try {
      // Also trigger process as fallback (in case webhook didn't fire)
      await apiClient.post(`/projects/${id}/process`).catch(() => {});
      // Then read the latest state
      const data = await apiClient.get(`/projects/${id}`);
      setProject(data);

      if (["completed", "failed"].includes(data.status) && pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    } catch {
      // ignore transient errors
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p>Project not found</p>
        <Link href="/projects" className="btn btn-ghost mt-4">
          Back to projects
        </Link>
      </div>
    );
  }

  const isProcessing = ["generating", "classifying", "assembling"].includes(
    project.status
  );

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/projects"
            className="text-sm text-base-content/50 hover:text-base-content"
          >
            &larr; All Projects
          </Link>
          <h1 className="text-2xl font-bold mt-1">
            {project.propertyInfo?.address || project.name}
          </h1>
          {project.propertyInfo?.price && (
            <p className="text-base-content/70">{project.propertyInfo.price}</p>
          )}
        </div>
        <span
          className={`badge badge-lg ${
            project.status === "completed"
              ? "badge-success"
              : project.status === "failed"
                ? "badge-error"
                : "badge-warning"
          }`}
        >
          {isProcessing && (
            <span className="loading loading-spinner loading-xs mr-1" />
          )}
          {project.status}
        </span>
      </div>

      {/* Progress */}
      {isProcessing && (
        <div>
          <progress
            className="progress progress-primary w-full"
            value={project.progress}
            max="100"
          />
          <p className="text-sm text-base-content/50 mt-1 text-center">
            {project.status === "assembling"
              ? "Assembling final video..."
              : `${project.progress}%`}
          </p>
        </div>
      )}

      {/* Final video */}
      {project.finalVideoUrl && (
        <div className="card bg-base-200">
          <div className="card-body">
            <h2 className="card-title">Final Video</h2>
            <video
              src={project.finalVideoUrl}
              controls
              className="w-full rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Clips grid */}
      <div>
        <h2 className="text-lg font-semibold mb-3">
          Clips ({project.clips?.length || 0})
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {project.clips?.map((clip, i) => (
            <div key={i} className="card bg-base-200">
              <div className="card-body p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">
                    Clip {clip.order + 1}
                  </span>
                  <ClipStatus clip={clip} />
                </div>

                {/* Source image */}
                {clip.sourceImageUrl && (
                  <img
                    src={clip.sourceImageUrl}
                    alt=""
                    className="w-full h-28 object-cover rounded"
                  />
                )}

                {/* Transformed image */}
                {clip.transformedImageUrl && (
                  <div>
                    <p className="text-xs text-base-content/50 mt-1">
                      Transformed
                    </p>
                    <img
                      src={clip.transformedImageUrl}
                      alt=""
                      className="w-full h-28 object-cover rounded"
                    />
                  </div>
                )}

                {/* Video */}
                {clip.videoUrl && (
                  <video
                    src={clip.videoUrl}
                    controls
                    muted
                    className="w-full rounded mt-1"
                  />
                )}

                {/* Error */}
                {(clip.imageJob?.error || clip.videoJob?.error) && (
                  <p className="text-xs text-error mt-1 truncate">
                    {clip.imageJob?.error || clip.videoJob?.error}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Property info */}
      {project.propertyInfo?.description && (
        <div className="card bg-base-200">
          <div className="card-body p-4">
            <h3 className="font-medium text-sm text-base-content/50">
              Property Details
            </h3>
            <p className="text-sm">{project.propertyInfo.description}</p>
          </div>
        </div>
      )}
    </div>
  );
};

const ClipStatus = ({ clip }) => {
  const imageStatus = clip.imageJob?.status || "pending";
  const videoStatus = clip.videoJob?.status || "pending";

  if (videoStatus === "completed") {
    return <span className="badge badge-success badge-sm">Done</span>;
  }
  if (imageStatus === "failed" || videoStatus === "failed") {
    return <span className="badge badge-error badge-sm">Failed</span>;
  }
  if (videoStatus === "processing") {
    return (
      <span className="badge badge-warning badge-sm gap-1">
        <span className="loading loading-spinner loading-xs" />
        Video
      </span>
    );
  }
  if (imageStatus === "processing") {
    return (
      <span className="badge badge-info badge-sm gap-1">
        <span className="loading loading-spinner loading-xs" />
        Transform
      </span>
    );
  }
  return <span className="badge badge-ghost badge-sm">Waiting</span>;
};

export default ProjectPage;
