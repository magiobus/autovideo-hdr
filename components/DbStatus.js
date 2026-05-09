"use client";

import { useState, useEffect } from "react";
import apiClient from "@/libs/api";

const DbStatus = () => {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    apiClient
      .get("/health")
      .then(() => setStatus("connected"))
      .catch(() => setStatus("error"));
  }, []);

  const colors = {
    checking: "badge-warning",
    connected: "badge-success",
    error: "badge-error",
  };

  const labels = {
    checking: "Checking DB...",
    connected: "DB Connected",
    error: "DB Error",
  };

  return (
    <span className={`badge ${colors[status]} gap-2`}>
      <span
        className={`w-2 h-2 rounded-full ${
          status === "connected" ? "bg-success-content" : "bg-current"
        }`}
      />
      {labels[status]}
    </span>
  );
};

export default DbStatus;
