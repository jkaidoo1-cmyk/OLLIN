"use client";

/**
 * Opt-in client timing. Enable per visit with `?perf=1`, or once with
 * `localStorage.perf = "1"` in the console. Does nothing otherwise.
 *
 * Server response times (the only thing we could measure from curl) don't
 * decide whether a tap feels instant. These three do:
 *   - route -> painted: click to the new page's content on screen;
 *   - INP: interaction to next paint (the "is it laggy?" number);
 *   - long tasks: main-thread blocks over 50ms, where jank comes from.
 */

const enabled = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return (
      new URLSearchParams(window.location.search).has("perf") ||
      window.localStorage.getItem("perf") === "1"
    );
  } catch {
    return false;
  }
};

const log = (label: string, ms: number) => {
  // Opt-in diagnostics: printed only when the probe was asked for.
  console.log(`%c[perf] ${label} ${ms.toFixed(0)}ms`, "color:#0b5d34;font-weight:bold");
};

export function startPerf(): void {
  if (!enabled()) return;

  // Interaction -> next paint. Only slow ones (>=100ms) are worth printing.
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= 100) log(`INP ${entry.name}`, entry.duration);
      }
    }).observe({
      type: "event",
      durationThreshold: 100,
      buffered: true,
    } as PerformanceObserverInit);
  } catch {
    /* older browser: no event timing */
  }

  // Main-thread blocks. Anything here is a frame the user waited on.
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) log("long task", entry.duration);
    }).observe({ type: "longtask", buffered: true } as PerformanceObserverInit);
  } catch {
    /* unsupported */
  }

  // Click -> content painted, via the first largest-contentful-paint after it.
  let navStart = 0;
  document.addEventListener(
    "click",
    () => {
      navStart = performance.now();
    },
    true
  );
  try {
    new PerformanceObserver((list) => {
      if (!navStart || !list.getEntries().length) return;
      const start = navStart;
      navStart = 0;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => log("route -> painted", performance.now() - start))
      );
    }).observe({ type: "largest-contentful-paint", buffered: true } as PerformanceObserverInit);
  } catch {
    /* unsupported */
  }
}
