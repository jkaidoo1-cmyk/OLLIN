"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";


export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-[#006633] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center">
          <Link href="/" className="flex items-center gap-1 no-underline shrink-0">
            <Logo onDark />
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
              <Link href="/login" className="btn-primary px-6 py-2.5 no-underline">
                Log in
              </Link>
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
      <footer className="bg-[#006633] text-white relative overflow-hidden">
        {/* Decorative circles — same motif as the green banners */}
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/5" aria-hidden />
        <div className="absolute -bottom-20 -left-10 w-44 h-44 rounded-full bg-white/5" aria-hidden />
        <div className="absolute top-1/2 left-1/3 w-24 h-24 rounded-full bg-white/[0.04]" aria-hidden />
        <div className="relative max-w-6xl mx-auto px-6 py-6">
          {/* On phones the two link columns sit side by side next to nothing —
              brand row on top, links in a compact 2-col row below. */}
          <div className="flex flex-col sm:grid sm:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Logo onDark />
                <span className="text-base font-bold text-white">OLLIN</span>
              </div>
              <p className="text-sm text-white/70">Quiz platform for students</p>
            </div>
            <div className="grid grid-cols-2 gap-6 sm:contents">
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
                  <li><Link href="/support" className="hover:text-white transition-colors">Help &amp; support</Link></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="border-t border-white/20 mt-5 pt-3 text-xs text-white/50">
            &copy; {new Date().getFullYear()} OLLIN. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
