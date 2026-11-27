"use client";

/**
 * Ollin ring mark — a forest-green ring with a diagonal cut-out at the
 * bottom-left and a bright green dot in the centre. Pure SVG so it stays
 * crisp at any size and inherits the surrounding text colour.
 *
 * The ring is drawn as a single arc with round caps, so both ends of the
 * cut-out are rounded instead of squared off.
 */
const VIEW = 24;
const RING_RADIUS = 9.2;
const RING_WIDTH = 3.4;
const DOT_RADIUS = 3.6;
/** Cut-out centre, in SVG degrees (0 = right, 90 = down). */
const GAP_CENTER = 134;
/** Angular width of the cut-out, before the round caps eat into it. */
const GAP_SPAN = 52;

/** One arc around the circle, leaving the cut-out between its two ends. */
function ringArc(radius: number, gapCenter: number, gapSpan: number): string {
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    const x = VIEW / 2 + radius * Math.cos(rad);
    const y = VIEW / 2 + radius * Math.sin(rad);
    return `${x.toFixed(3)} ${y.toFixed(3)}`;
  };
  const start = gapCenter + gapSpan / 2;
  const end = gapCenter - gapSpan / 2 + 360;
  return `M ${point(start)} A ${radius} ${radius} 0 1 1 ${point(end)}`;
}

export function BrandMark({ className = "", onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden>
      <svg width="34" height="34" viewBox={`0 0 ${VIEW} ${VIEW}`} fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d={ringArc(RING_RADIUS, GAP_CENTER, GAP_SPAN)}
          fill="none"
          stroke="currentColor"
          strokeWidth={RING_WIDTH}
          strokeLinecap="round"
        />
        <circle cx={VIEW / 2} cy={VIEW / 2} r={DOT_RADIUS} fill={onDark ? "#7FE0A6" : "#3CC46F"} />
      </svg>
    </span>
  );
}

export function BrandSpinner({ className = "" }: { className?: string }) {
  const radius = 8.8;
  const width = 2.9;

  return (
    <span className={`brand-spinner ${className}`} role="status" aria-label="Loading">
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        {/* Only the notched ring turns; the centre dot holds still, so the mark
            reads as the logo spinning around its own core. */}
        <g className="brand-spinner-ring">
          <path
            d={ringArc(radius, 133, 59)}
            fill="none"
            stroke="currentColor"
            strokeWidth={width}
            strokeLinecap="round"
            opacity="0.9"
          />
        </g>
        <circle cx={VIEW / 2} cy={VIEW / 2} r={3.2} fill="#3CC46F" />
      </svg>
    </span>
  );
}
