"use client";

import { useCallback, useRef, useState } from "react";

/**
 * A visible spin for refresh buttons.
 *
 * Tying the icon to the request itself looked broken: a cached or fast fetch
 * finishes in well under a frame's worth of motion, so the button just flicked
 * and nothing appeared to happen. The spin is held for a minimum time instead,
 * and a second click while a refresh is in flight is ignored rather than
 * queueing another request.
 */

const MIN_VISIBLE_MS = 600;

export function useRefreshSpin(): {
  spinning: boolean;
  run: (task: () => Promise<unknown> | unknown) => Promise<void>;
} {
  const [spinning, setSpinning] = useState(false);
  const busy = useRef(false);

  const run = useCallback(async (task: () => Promise<unknown> | unknown) => {
    if (busy.current) return;
    busy.current = true;
    setSpinning(true);
    const started = Date.now();
    try {
      await task();
    } finally {
      const remaining = MIN_VISIBLE_MS - (Date.now() - started);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
      busy.current = false;
      setSpinning(false);
    }
  }, []);

  return { spinning, run };
}
