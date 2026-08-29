"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brain } from "lucide-react";
import { enableDemoMode } from "@/lib/demo";


export default function Home() {
  const router = useRouter();

  const handleDemo = () => {
    enableDemoMode();
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-[#006633] text-white">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
          <Link href="/" className="flex items-center gap-2 no-underline shrink-0">
            <Brain className="w-5 h-5 text-white" />
            <span className="text-base font-bold text-white">OLLIN</span>
          </Link>

          {/* Nav — centered, takes remaining space */}
          <nav className="flex-1 flex items-center justify-center">
            <Link href="/login" className="hidden sm:inline-block px-4 py-1 text-sm font-medium text-white/60 hover:text-white transition-colors no-underline">
              Home
            </Link>
            <Link href="/join" className="px-4 py-1 text-sm font-medium text-white/60 hover:text-white transition-colors no-underline">
              Join a quiz
            </Link>
            <Link href="/login" className="hidden sm:inline-block px-4 py-1 text-sm font-medium text-white/60 hover:text-white transition-colors no-underline">
              Dashboard
            </Link>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/login" className="text-sm font-medium text-white bg-white/15 hover:bg-white/25 px-4 py-1.5 rounded transition-colors no-underline">
              Log in
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        {/* Hero */}
        <section className="bg-white border-b border-[#e0e0e0]">
          <div className="max-w-6xl mx-auto px-6 py-16 text-center">
            <h1 className="text-3xl sm:text-4xl font-bold text-[#333] mb-4">
              OLLIN Quiz Platform
            </h1>
            <p className="text-base text-[#666] max-w-lg mx-auto mb-8">
              Upload your study material, generate quizzes, and share them with your classmates.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={handleDemo} className="btn-primary px-6 py-2.5">
                Try demo
              </button>
              <Link href="/join" className="text-sm font-medium text-[#006633] border border-[#006633] hover:bg-[#006633]/5 px-5 py-2.5 rounded transition-colors no-underline">
                Join a quiz
              </Link>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="max-w-6xl mx-auto px-6 py-12">
          <h2 className="text-lg font-bold text-[#333] mb-8">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { num: "1", title: "Upload your material", desc: "Paste notes or upload a PDF/DOCX file. The platform reads through your content." },
              { num: "2", title: "Generate questions", desc: "Get quiz questions built from your material. Review and edit before publishing." },
              { num: "3", title: "Share with classmates", desc: "Get a quiz code. Your friends enter it, take the quiz, and see their results." },
            ].map((item) => (
              <div key={item.num} className="bg-white border border-[#e0e0e0] rounded-lg p-5">
                <div className="w-8 h-8 rounded-full bg-[#006633] text-white text-sm font-bold flex items-center justify-center mb-3">
                  {item.num}
                </div>
                <h3 className="text-sm font-semibold text-[#333] mb-1">{item.title}</h3>
                <p className="text-sm text-[#666]">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#006633] text-white">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-5 h-5 text-white" />
                <span className="text-base font-bold text-white">OLLIN</span>
              </div>
              <p className="text-sm text-white/70">Quiz platform for students</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Quick Links</h4>
              <ul className="space-y-2 text-sm text-white/70">
                <li><Link href="/dashboard" className="text-white/70 hover:text-white no-underline">Dashboard</Link></li>
                <li><Link href="/dashboard/create" className="text-white/70 hover:text-white no-underline">Create quiz</Link></li>
                <li><Link href="/join" className="text-white/70 hover:text-white no-underline">Join a quiz</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Support</h4>
              <ul className="space-y-2 text-sm text-white/70">
                <li><span className="text-white/70">Help desk</span></li>
                <li><span className="text-white/70">Contact admin</span></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/20 mt-6 pt-4 text-xs text-white/50">
            &copy; {new Date().getFullYear()} OLLIN. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
