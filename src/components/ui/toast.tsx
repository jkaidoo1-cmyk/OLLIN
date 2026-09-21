"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from "lucide-react";

/**
 * App-wide toast + confirm dialog system, styled to match OLLIN's own UI:
 *
 * - Toasts mirror the in-app alert banners (soft tinted bg, thin border,
 *   small text) e.g. `bg-green-50 border-green-200 text-green-700`.
 * - The confirm dialog mirrors the app's modals (CSV import, account form):
 *   header row with icon + small bold title + X close, bordered body, and a
 *   right-aligned footer action row.
 *
 * Usage:
 *   const toast = useToast();
 *   toast.success("Saved");
 *
 *   const confirm = useConfirm();
 *   const ok = await confirm({ title: "Delete user?", tone: "danger" });
 */

// ─── Toasts ─────────────────────────────────────────────────────────

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  leaving?: boolean;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi>({
  success: () => {},
  error: () => {},
  info: () => {},
});

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const TOAST_ICONS: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

// Same soft-tint language as the inline alert banners used across the app
const TOAST_STYLES: Record<ToastTone, string> = {
  success: "bg-green-50 border-green-200 text-green-800",
  error: "bg-red-50 border-red-200 text-red-700",
  info: "bg-[#f8f8f8] border-[#e0e0e0] text-[#333]",
};

const TOAST_ICON_STYLES: Record<ToastTone, string> = {
  success: "text-green-600",
  error: "text-red-500",
  info: "text-[#006633]",
};

let toastCounter = 0;

function ToastProviderInner({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.current.delete(id);
    }, 200);
    timers.current.set(id, timer);
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = ++toastCounter;
      setToasts((prev) => [...prev.slice(-3), { id, tone, message }]); // max 4 visible
      const timer = setTimeout(() => remove(id), 3800);
      timers.current.set(id, timer);
    },
    [remove]
  );

  useEffect(() => {
    const map = timers.current;
    return () => { for (const t of map.values()) clearTimeout(t); };
  }, []);

  const api: ToastApi = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none"
      >
        {toasts.map((t) => {
          const Icon = TOAST_ICONS[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto w-full flex items-start gap-2.5 border rounded-lg shadow-md px-3 py-2.5 transition-all duration-200 ${
                TOAST_STYLES[t.tone]
              } ${t.leaving ? "opacity-0 -translate-y-2" : "animate-[toast-in_.2s_ease-out]"}`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${TOAST_ICON_STYLES[t.tone]}`} />
              <p className="text-xs leading-relaxed flex-1">{t.message}</p>
              <button
                onClick={() => remove(t.id)}
                className="p-0.5 rounded opacity-50 hover:opacity-100 flex-shrink-0"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <ToastProviderInner>{children}</ToastProviderInner>;
}

// ─── Confirm dialog ─────────────────────────────────────────────────

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

interface ConfirmState extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(
  async () => false
);

export function useConfirm() {
  return useContext(ConfirmContext);
}

function ConfirmProviderInner({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setState({ ...opts, resolve });
      }),
    []
  );

  const settle = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };

  // Escape closes as cancel
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const danger = state?.tone === "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[90] bg-black/30 flex items-center justify-center p-4 animate-[fade-in_.15s_ease-out]"
          onClick={() => settle(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            className="bg-white rounded-lg shadow-2xl w-full max-w-sm p-6 animate-[dialog-in_.18s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon chip + text — same chip language as the Activity list */}
            <div className="flex items-start gap-3">
              <div
                className={`w-9 h-9 rounded flex items-center justify-center flex-shrink-0 ${
                  danger ? "bg-red-50" : "bg-[#e6f0e8]"
                }`}
              >
                <AlertTriangle
                  className={`w-4 h-4 ${danger ? "text-red-500" : "text-[#006633]"}`}
                />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <h2 className="text-sm font-semibold text-[#333] leading-snug">{state.title}</h2>
                {state.body && (
                  <p className="text-xs text-[#666] mt-1.5 leading-relaxed">{state.body}</p>
                )}
              </div>
            </div>

            {/* Quiet cancel + tinted action button (no heavy borders) */}
            <div className="flex justify-end gap-1.5 mt-5">
              <button
                onClick={() => settle(false)}
                className="px-3.5 py-2 text-xs text-[#666] hover:text-[#333] rounded min-h-[36px] transition-colors"
              >
                {state.cancelLabel || "Cancel"}
              </button>
              <button
                onClick={() => settle(true)}
                autoFocus
                className="px-4 py-2 text-xs rounded min-h-[36px] bg-[#006633] text-white hover:bg-[#005528] transition-colors"
              >
                {state.confirmLabel || (danger ? "Delete" : "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  return <ConfirmProviderInner>{children}</ConfirmProviderInner>;
}
