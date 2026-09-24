"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, LifeBuoy, Loader2, MessageCircle, Send, UserRound } from "lucide-react";

/**
 * Help desk — original layout, sharpened UI:
 * quick-topic chips for the subject, a signed-in identity row (so logged-in
 * users skip the name/contact fields they don't need), a submit button that
 * waits for a real message, and a success state with "Send another".
 */

const QUICK_TOPICS = [
  "Quiz code not working",
  "Can't log in",
  "Wrong course or year",
  "Score looks wrong",
  "Account details need changing",
  "Something else",
] as const;

export default function SupportPage() {
  const [form, setForm] = useState({ name: "", contact: "", subject: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  // ?from=dashboard → students came from the dashboard menu, send them back there
  const [back, setBack] = useState<{ href: string; label: string }>({ href: "/", label: "Back to OLLIN" });
  const [me, setMe] = useState<{ full_name: string; email: string } | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("from") === "dashboard") {
      setBack({ href: "/dashboard", label: "Back to dashboard" });
    }
    // Prefill identity for logged-in senders (the API trusts the session anyway;
    // this just shows them who they're sending as and hides redundant fields).
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) {
          setMe({ full_name: d.user.full_name || "", email: d.user.email || "" });
          setForm((f) => ({ ...f, name: f.name || d.user.full_name || "", contact: f.contact || d.user.email || "" }));
        }
      })
      .catch(() => { /* guests fill the form themselves */ });
  }, []);

  const set = (k: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (form.message.trim().length < 2) {
      setError("Please write your message before sending.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not send your message. Please try again.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Could not reach the server. Please check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  const canSend = form.message.trim().length >= 2 && !sending;

  return (
    <div className="min-h-screen bg-[#f7f7f5]">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href={back.href} className="inline-flex items-center gap-1.5 text-sm text-[#666] hover:text-[#333] mb-6 no-underline">
          <ArrowLeft className="w-4 h-4" /> {back.label}
        </Link>

        <div className="bg-white border border-[#e0e0e0] rounded-lg p-6 mb-5">
          <div className="w-10 h-10 rounded bg-green-50 text-green-600 flex items-center justify-center mb-3">
            <LifeBuoy className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold text-[#333] mb-1">Help desk</h1>
          <p className="text-sm text-[#666]">
            Stuck with a quiz code, your account, or anything else in OLLIN?
            Send a message and the admin will get back to you.
          </p>
        </div>

        {sent ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-3">
              <Check className="w-5 h-5" />
            </div>
            <h2 className="text-base font-semibold text-[#333] mb-1">Message sent</h2>
            <p className="text-sm text-[#666] mb-4">
              The admin has been notified and will reply soon
              {me ? " — the reply will arrive in your notifications" : ""}.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link href={back.href} className="text-sm text-green-700 hover:text-green-800 font-medium no-underline">
                {back.label}
              </Link>
              <button
                type="button"
                onClick={() => { setSent(false); setForm((f) => ({ ...f, subject: "", message: "" })); }}
                className="text-sm text-[#666] hover:text-[#333] font-medium"
              >
                Send another
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-white border border-[#e0e0e0] rounded-lg p-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 mb-4">
                {error}
              </div>
            )}

            {/* Signed-in identity — replaces the name/contact fields */}
            {me ? (
              <div className="flex items-center gap-3 bg-[#fafafa] border border-[#f0f0f0] rounded px-3 py-2.5 mb-4">
                <span className="w-8 h-8 rounded bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                  <UserRound className="w-4 h-4" />
                </span>
                <span className="flex-1 min-w-0 text-sm">
                  <span className="block font-medium text-[#333] truncate">
                    Sending as {me.full_name || me.email}
                  </span>
                  <span className="block text-xs text-[#999]">The admin can reply straight to your account</span>
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="sup-name" className="block text-xs font-medium text-[#666] mb-1.5">
                    Your name <span className="text-[#aaa]">(optional)</span>
                  </label>
                  <input
                    id="sup-name"
                    value={form.name}
                    onChange={set("name")}
                    maxLength={80}
                    placeholder="e.g. Ama Mensah"
                    className="w-full border border-[#d9d9d9] rounded px-3 py-2 text-sm text-[#333] bg-white focus:outline-none focus:border-green-600"
                  />
                </div>
                <div>
                  <label htmlFor="sup-contact" className="block text-xs font-medium text-[#666] mb-1.5">
                    Email or phone <span className="text-[#aaa]">(so we can reply)</span>
                  </label>
                  <input
                    id="sup-contact"
                    value={form.contact}
                    onChange={set("contact")}
                    maxLength={120}
                    placeholder="e.g. ama@example.com"
                    className="w-full border border-[#d9d9d9] rounded px-3 py-2 text-sm text-[#333] bg-white focus:outline-none focus:border-green-600"
                  />
                </div>
              </div>
            )}

            <div className="mb-4">
              <label htmlFor="sup-subject" className="block text-xs font-medium text-[#666] mb-1.5">
                What is it about?
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {QUICK_TOPICS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, subject: t }))}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      form.subject === t
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-white text-[#666] border-[#e0e0e0] hover:border-green-500 hover:text-green-700"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <input
                id="sup-subject"
                value={form.subject}
                onChange={set("subject")}
                maxLength={120}
                placeholder="Or type your own topic"
                className="w-full border border-[#d9d9d9] rounded px-3 py-2 text-sm text-[#333] bg-white focus:outline-none focus:border-green-600"
              />
            </div>

            <div className="mb-5">
              <label htmlFor="sup-message" className="block text-xs font-medium text-[#666] mb-1.5">
                Message <span className="text-red-500">*</span>
              </label>
              <textarea
                id="sup-message"
                value={form.message}
                onChange={set("message")}
                maxLength={2000}
                rows={6}
                required
                placeholder="Describe the problem or your question — include the quiz code if it's about a specific quiz…"
                className="w-full border border-[#d9d9d9] rounded px-3 py-2 text-sm text-[#333] bg-white focus:outline-none focus:border-green-600 resize-y"
              />
              <p className="text-xs text-[#999] mt-1 text-right">{form.message.length}/2000</p>
            </div>

            <button
              type="submit"
              disabled={!canSend}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#006633] hover:bg-[#00552b] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? "Sending…" : "Send message"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
