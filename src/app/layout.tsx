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
  icons: { icon: "/favicon.ico", apple: "/icon-192.png" },
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#006633",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').catch(function(){});
              // A new service worker takes over via skipWaiting + clients.claim.
              // Reload once so the page picks up the fresh app shell instead of
              // serving stale cached chunks until a manual hard refresh.
              // (Only when a controller already existed — first install needs no reload.)
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
