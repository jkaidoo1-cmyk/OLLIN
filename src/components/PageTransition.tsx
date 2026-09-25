"use client";

import { useCallback } from "react";

/**
 * PageTransition — choreographed page entrance.
 *
 * The wrapper (`.page-enter`) is remounted by the root template on every
 * navigation. In a ref callback (commit phase, pre-paint — no flash) we
 * find the page's top-level blocks and give them a staggered rise:
 *   - headers stay instant, so the page feels anchored;
 *   - content blocks rise in a soft wave (block-rise keyframes);
 *   - blocks containing fixed/sticky elements animate opacity-only,
 *     because a transform mid-flight would re-anchor their viewport
 *     geometry (bottom action bars, sticky toolbars) and cause a jump.
 *
 * Respect prefers-reduced-motion; skip re-application on re-renders via
 * a dataset flag (ref callbacks re-run whenever their identity changes).
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const setRoot = useCallback((el: HTMLDivElement | null) => {
    if (!el || el.dataset.entered) return;
    el.dataset.entered = "1";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Blocks = the wrapper's children, or — the common case — the single
    // page-root div's children (header/main/footer siblings).
    let blocks = Array.from(el.children) as HTMLElement[];
    if (blocks.length === 1 && blocks[0].children.length > 1) {
      blocks = Array.from(blocks[0].children) as HTMLElement[];
    }

    let step = 0;
    for (const block of blocks) {
      if (block.tagName === "HEADER") continue; // anchored, no entrance
      const pinned = block.querySelector(".fixed, .sticky") !== null;
      const delay = (0.05 + step * 0.06).toFixed(2);
      block.style.animation = pinned
        ? `page-fade 0.3s ease-out ${delay}s backwards`
        : `block-rise 0.4s cubic-bezier(0.22, 1, 0.36, 1) ${delay}s backwards`;
      step = Math.min(step + 1, 5); // cap the wave at ~0.35s
    }
  }, []);

  return (
    <div ref={setRoot} className="page-enter flex flex-col grow">
      {children}
    </div>
  );
}
