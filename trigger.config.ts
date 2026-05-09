import { defineConfig } from "@trigger.dev/sdk";
import { ffmpeg } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_ecpowmllnejxhxdvlbvr",
  dirs: ["./trigger"],
  maxDuration: 1800, // 30 minutes max per task
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 2,
      minTimeoutInMs: 5000,
      maxTimeoutInMs: 30000,
      factor: 2,
    },
  },
  build: {
    extensions: [ffmpeg()],
  },
});
