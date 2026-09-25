/**
 * Skeleton building blocks — placeholders shown while a page fetches its
 * data, so pages open instantly with structure instead of blank panels.
 *
 * Use the generic primitives (SkeletonText/SkeletonCard/SkeletonList) or a
 * purpose-built variant like SkeletonStats. `.skeleton` in globals.css owns
 * the shimmer.
 */

export function SkeletonText({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/** A single rounded card placeholder (row, list item, panel). */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/** Vertical stack of list-row placeholders. */
export function SkeletonList({ rows = 4, rowClass = "h-16" }: { rows?: number; rowClass?: string }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`skeleton ${rowClass}`} />
      ))}
    </div>
  );
}

/** Four-stat grid used by dashboard/overview headers. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton h-20" />
      ))}
    </div>
  );
}

/** Full-panel loading state (icon pages: attempts, notifications, activity). */
export function SkeletonPanel({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-white border border-[#e0e0e0] rounded-lg p-6 space-y-4" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="skeleton w-10 h-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-2/5" />
            <div className="skeleton h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
