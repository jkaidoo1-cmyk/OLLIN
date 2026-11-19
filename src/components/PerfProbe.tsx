"use client";

import { useEffect } from "react";

/** Starts the opt-in timing probe. Renders nothing, costs nothing when off. */
export function PerfProbe() {
  useEffect(() => {
    const wanted =
      new URLSearchParams(window.location.search).has("perf") ||
      window.localStorage.getItem("perf") === "1";
    if (!wanted) return;
    import("@/lib/perf").then(({ startPerf }) => startPerf()).catch(() => {});
  }, []);
  return null;
}
