"use client";

import Link from "next/link";
import { useAuth, SignInButton, UserButton } from "@clerk/nextjs";

export default function AuthButtons() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return null;

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/trips"
          className="text-xs font-mono uppercase tracking-widest text-[#7d8590] hover:text-[#f0f6fc] transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
        >
          My Trips
        </Link>
        <UserButton />
      </div>
    );
  }

  return (
    <SignInButton mode="modal">
      <button className="text-xs font-mono uppercase tracking-widest text-[#666] border border-[#333] px-3 py-1.5 hover:border-[#555] transition-colors">
        Sign In
      </button>
    </SignInButton>
  );
}
