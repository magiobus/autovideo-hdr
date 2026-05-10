"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";

const navLinks = [
  { label: "Contact", href: "#contact" },
  { label: "Pricing", href: "#pricing" },
  { label: "Models", href: "#models" },
  { label: "Video Studio", href: "/projects" },
  { label: "Listings", href: "#listings" },
];

const Logo = () => (
  <Link href="/" className="flex items-center gap-2 font-semibold text-base">
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-xs font-bold">
      AH
    </span>
    AutoHDR
  </Link>
);

const Navbar = () => {
  const { data: session, status } = useSession();
  const authed = status === "authenticated";

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-black/60 border-b border-white/5">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <ul className="hidden md:flex items-center gap-6 text-sm text-white/70 flex-1">
          {navLinks.map((l) => (
            <li key={l.label}>
              <Link href={l.href} className="hover:text-white transition-colors">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex-1 flex justify-start md:justify-center">
          <Logo />
        </div>

        <div className="flex-1 flex justify-end items-center gap-3">
          {authed ? (
            <>
              {session.user?.image && (
                <img
                  src={session.user.image}
                  alt={session.user.name || "Account"}
                  className="h-8 w-8 rounded-full border border-white/10"
                  referrerPolicy="no-referrer"
                />
              )}
              <button
                className="rounded-full bg-white text-black text-sm font-medium px-5 py-2 hover:bg-white/90 transition"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              className="rounded-full bg-white text-black text-sm font-medium px-5 py-2 hover:bg-white/90 transition"
              onClick={() => signIn("google")}
            >
              Sign In
            </button>
          )}
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
