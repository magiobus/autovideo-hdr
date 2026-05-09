import Link from "next/link";
import { auth } from "@/libs/auth";
import DbStatus from "@/components/DbStatus";
import ButtonSignin from "@/components/ButtonSignin";

export default async function Home() {
  const session = await auth();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-5xl font-bold mb-4">AutoVideo HDR</h1>
      <p className="text-xl text-base-content/70 max-w-lg text-center mb-6">
        AI-powered real estate photo to cinematic video generation
      </p>
      <div className="flex flex-col items-center gap-4">
        {session ? (
          <Link href="/generate" className="btn btn-primary btn-lg">
            Create Video
          </Link>
        ) : (
          <ButtonSignin />
        )}
        <DbStatus />
      </div>
    </main>
  );
}
