import Link from "next/link";
import VideoWizard from "@/components/VideoWizard";

export const metadata = {
  title: "Generate Video — AutoVideo HDR",
};

export default function GeneratePage() {
  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="flex justify-end mb-4">
        <Link href="/projects" className="btn btn-ghost btn-sm">
          My Projects &rarr;
        </Link>
      </div>
      <VideoWizard />
    </main>
  );
}
