"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import apiClient from "@/libs/api";

const statusColors = {
  draft: "badge-ghost",
  classifying: "badge-info",
  generating: "badge-warning",
  assembling: "badge-info",
  completed: "badge-success",
  failed: "badge-error",
};

const ProjectsPage = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = () => {
    apiClient
      .get("/projects")
      .then((data) => setProjects(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProjects();
    // Poll every 10s if any project is still processing
    const interval = setInterval(() => {
      fetchProjects();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Projects</h1>
        <Link href="/generate" className="btn btn-primary btn-sm">
          New Video
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-12 text-base-content/50">
          <p>No projects yet.</p>
          <Link href="/generate" className="btn btn-primary mt-4">
            Create your first video
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <Link
              key={project._id}
              href={`/projects/${project._id}`}
              className="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
            >
              <div className="card-body p-4 flex-row items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <h3 className="font-medium">
                      {project.propertyInfo?.address || project.name}
                    </h3>
                    <p className="text-sm text-base-content/50">
                      {project.style?.name || "Unknown style"} &middot;{" "}
                      {project.clips?.length || 0} clips
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {(project.status === "generating" ||
                    project.status === "classifying") && (
                    <div className="flex items-center gap-2">
                      <progress
                        className="progress progress-primary w-24"
                        value={project.progress}
                        max="100"
                      />
                      <span className="text-xs text-base-content/50">
                        {project.progress}%
                      </span>
                    </div>
                  )}
                  <span
                    className={`badge ${statusColors[project.status] || "badge-ghost"}`}
                  >
                    {project.status}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;
