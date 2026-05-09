"use client";

import { useSession, signIn, signOut } from "next-auth/react";

const ButtonSignin = ({ text = "Sign in with Google", extraStyle }) => {
  const { data: session, status } = useSession();

  if (status === "authenticated") {
    return (
      <div className="flex items-center gap-3">
        {session.user?.image && (
          <img
            src={session.user.image}
            alt={session.user.name || "Account"}
            className="w-8 h-8 rounded-full"
            referrerPolicy="no-referrer"
          />
        )}
        <span className="text-sm">{session.user?.name}</span>
        <button
          className="btn btn-sm btn-outline"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <button
      className={`btn btn-primary ${extraStyle || ""}`}
      onClick={() => signIn("google")}
    >
      {text}
    </button>
  );
};

export default ButtonSignin;
