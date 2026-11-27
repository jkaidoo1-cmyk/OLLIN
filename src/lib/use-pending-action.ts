"use client";

import { useCallback, useRef, useState } from "react";

/**
 * One action at a time.
 *
 * A click that starts work has to be able to stop an identical second click
 * from starting a second request. `pending` state alone cannot: React batches
 * it, so two taps 40 ms apart both read `pending === false` and both fire.
 * `begin()` flips a ref synchronously, before the first await, and that ref is
 * the real lock — the state only drives what the button looks like.
 *
 * Usage:
 *   const { pending, begin, end } = usePendingAction();
 *   onSubmit: if (!begin()) return; ... try { await save(); } finally { end(); }
 *   <button disabled={pending} data-pending={pending || undefined}>
 *
 * `run(fn)` is the same lock with the try/finally spelled out.
 */
export function usePendingAction() {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);

  const begin = useCallback(() => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setPending(true);
    // A short tap confirms the press where the device can do it (Android);
    // silent elsewhere. Wrapped because some browsers expose nothing.
    try {
      navigator.vibrate?.(8);
    } catch {
      /* no haptics — the visual state still carries the cue */
    }
    return true;
  }, []);

  const end = useCallback(() => {
    inFlight.current = false;
    setPending(false);
  }, []);

  /** True while the guarded action is still running (read synchronously). */
  const isPending = useCallback(() => inFlight.current, []);

  const run = useCallback(
    async <T,>(action: () => Promise<T> | T): Promise<T | undefined> => {
      if (!begin()) return undefined;
      try {
        return await action();
      } finally {
        end();
      }
    },
    [begin, end]
  );

  return { pending, begin, end, isPending, run };
}
