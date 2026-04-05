import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
// Clerk v7 — no @clerk/themes package, use appearance prop directly
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Roadtripper",
  description: "Plan road trips with persona-based stop recommendations",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${geistMono.variable} h-full`}>
        <body className="min-h-full bg-[#0a0a0a] text-white font-mono antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
