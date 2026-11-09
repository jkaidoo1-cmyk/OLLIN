"use client";

import { useId } from "react";

/**
 * Ollin ring mark — a forest-green ring with a diagonal cut-out at the
 * bottom-left and a bright green dot in the centre. Pure SVG so it stays
 * crisp at any size and inherits the surrounding text colour.
 */
export function BrandMark({ className = "", onDark = false }: { className?: string; onDark?: boolean }) {
  const maskId = useId().replace(/:/g, "");

  return (
    <span className={`brand-mark ${className}`} aria-hidden>
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id={`bm-${maskId}`}>
            <rect width="24" height="24" fill="#fff"/>
            <rect x="-6.1" y="-2.5" width="10.8" height="5" transform="translate(5.5 18.8) rotate(135)" fill="#000"/>
          </mask>
        </defs>
        <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="3.4" mask={`url(#bm-${maskId})`}/>
        <circle cx="12" cy="12" r="3.6" fill={onDark ? "#7FE0A6" : "#3CC46F"}/>
      </svg>
    </span>
  );
}

export function BrandSpinner({ className = "" }: { className?: string }) {
  const maskId = useId().replace(/:/g, "");

  return (
    <span className={`brand-spinner ${className}`} role="status" aria-label="Loading">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <mask id={`bs-${maskId}`}>
            <rect width="24" height="24" fill="#fff"/>
            <rect x="-8" y="-2.5" width="14.2" height="6" transform="translate(5.5 19) rotate(135)" fill="#000"/>
          </mask>
        </defs>
        <circle cx="12" cy="12" r="8.8" stroke="currentColor" strokeWidth="2.9" strokeLinecap="round" mask={`url(#bs-${maskId})`} opacity="0.9"/>
        <circle cx="12" cy="12" r="3.2" fill="#3CC46F"/>
      </svg>
    </span>
  );
}
