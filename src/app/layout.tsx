import type { Metadata } from "next";
import "./globals.css";
import PatternBackground from "@/components/PatternBackground";
import { ToastProvider, ConfirmProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "OLLIN – Quiz Platform",
  description:
    "Create, share, and take quizzes built from your course materials. Track performance across your courses — built for students, by students.",
  keywords: ["quiz", "learning", "education", "study", "flashcards"],
  authors: [{ name: "OLLIN" }],
  openGraph: {
    title: "OLLIN – Quiz Platform",
    description: "Turn your study material into a quiz and share it in seconds.",
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
        <ToastProvider>
          <ConfirmProvider>
            <div className="relative z-10 flex flex-col min-h-full">{children}</div>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
