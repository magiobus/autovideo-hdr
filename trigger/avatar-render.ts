import { task } from "@trigger.dev/sdk";
import { syncPresenterAvatarForProject } from "./steps/presenter-avatar";

export const avatarRenderTask = task({
  id: "avatar-render",
  machine: {
    preset: "small-2x",
  },
  run: async ({ projectId }: { projectId: string }) => {
    return syncPresenterAvatarForProject(projectId);
  },
});
