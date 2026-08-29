import type { Metadata } from "next";
import "./globals.css";
import PatternBackground from "@/components/PatternBackground";

export const metadata: Metadata = {
  title: "OLLIN – AI-Powered Quiz Platform",
  description:
    "Upload your learning materials, let AI generate targeted questions, host quizzes, and track performance. Built for students, by students.",
  keywords: ["quiz", "AI", "learning", "education", "study", "flashcards"],
  authors: [{ name: "OLLIN" }],
  openGraph: {
    title: "OLLIN – AI-Powered Quiz Platform",
    description: "Turn any study material into an intelligent quiz in seconds.",
    type: "website",
  },
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col antialiased relative">
        <PatternBackground />
        <div className="relative z-10 flex flex-col min-h-full">{children}</div>
      </body>
    </html>
  );
}
