import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// The body face (quality bar, rule 2: a normal typeface at 16 px or more on
// a phone). Geist Mono stays for numbers, distances, times and codes only,
// through the `.num` class in globals.css.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Roadtripper",
  description: "Plan a road trip and see what is worth stopping for along the way",
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full bg-[#0a0a0a] text-white font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
