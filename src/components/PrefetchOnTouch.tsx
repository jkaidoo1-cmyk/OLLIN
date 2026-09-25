"use client";

/**
 * PrefetchOnTouch — warms a resource when the user shows intent (hover on
 * desktop, touchstart on phones), so the fetch overlaps the gesture and
 * navigation instead of starting after it.
 *
 * Wrap anything that navigates: <PrefetchOnTouch resource="quizzes">…</PrefetchOnTouch>
 * or self-closing alongside content to cover a whole page region.
 */
export default function PrefetchOnTouch({
  resource,
  fetcher,
  children,
  className,
}: {
  resource: string;
  fetcher: () => Promise<unknown>;
  children?: React.ReactNode;
  className?: string;
}) {
  const warm = () => {
    // Dynamic import keeps this component server-renderable and keeps the
    // prefetch module out of the initial bundle until it's actually used.
    import("@/lib/prefetch").then(({ warmResource }) => warmResource(resource, fetcher));
  };

  return (
    <span
      onMouseEnter={warm}
      onTouchStart={warm}
      onFocus={warm}
      className={className}
      style={className ? undefined : { display: "contents" }}
    >
      {children}
    </span>
  );
}
