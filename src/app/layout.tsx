import type { Metadata } from "next";
import "./globals.css";
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
  icons: { icon: "/favicon.ico", apple: "/icon-192.png" },
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#4CAF50",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Soft floating glass blobs for the glassmorphism background.
function GlassBackground() {
  return (
    <div
      className="fixed inset-0 pointer-events-none select-none overflow-hidden"
      aria-hidden
      style={{ zIndex: -1 }}
    >
      <div className="absolute -top-40 -right-40 w-[50vw] h-[50vw] rounded-full bg-primary/10 blur-xl" />
      <div className="absolute top-1/3 -left-40 w-[40vw] h-[40vw] rounded-full bg-primary/08 blur-2xl" />
      <div className="absolute -bottom-40 left-1/4 w-[45vw] h-[45vw] rounded-full bg-primary/06 blur-2xl" />
      <div className="absolute top-1/2 right-1/4 w-[30vw] h-[30vw] rounded-full bg-primary/05 blur-3xl" />
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col antialiased relative">
        <GlassBackground />
        <ToastProvider>
          <ConfirmProvider>
            <div className="relative z-10 flex flex-col min-h-full">{children}</div>
          </ConfirmProvider>
        </ToastProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(function(){});
              var refreshing = false;
              if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.addEventListener('controllerchange', function() {
                  if (refreshing) return;
                  refreshing = true;
                  window.location.reload();
                });
              }
            });`,
          }}
        />
      </body>
    </html>
  );
}
