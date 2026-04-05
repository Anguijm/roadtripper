"use client";

import { useAuth, SignInButton, UserButton } from "@clerk/nextjs";

export default function AuthButtons() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return null;

  if (isSignedIn) {
    return <UserButton />;
  }

  return (
    <SignInButton mode="modal">
      <button className="text-xs font-mono uppercase tracking-widest text-[#666] border border-[#333] px-3 py-1.5 hover:border-[#555] transition-colors">
        Sign In
      </button>
    </SignInButton>
  );
}
