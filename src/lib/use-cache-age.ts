"use client";

import { useEffect, useState } from "react";

/** "Updated just now" / "Updated 3 min ago" for a cache timestamp. */
export function formatAge(at: number | null): string {
  if (!at) return "";
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 45) return "Updated just now";
  if (s < 90) return "Updated 1 min ago";
  if (s < 3600) return `Updated ${Math.round(s / 60)} min ago`;
  return `Updated ${Math.round(s / 3600)} h ago`;
}

/**
 * The label above, kept fresh while the tab sits open so it does not stay at
 * "just now" forever. Re-renders once every 30 seconds; no network involved.
 */
export function useCacheAgeLabel(at: number | null): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  return formatAge(at);
}
