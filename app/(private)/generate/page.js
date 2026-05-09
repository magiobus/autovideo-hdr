import VideoWizard from "@/components/VideoWizard";

export const metadata = {
  title: "Generate Video — AutoVideo HDR",
};

export default function GeneratePage() {
  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      <VideoWizard />
    </main>
  );
}
