"use client";

import { useEffect, useState } from "react";

/**
 * True while the browser reports no connection.
 *
 * Starts false so the server render and the first client render agree, then
 * syncs on mount and follows the online/offline events.
 */
export function useOffline(): boolean {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(navigator.onLine === false);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return offline;
}
