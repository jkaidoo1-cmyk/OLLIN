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
  themeColor: "#f4f8f5",
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
