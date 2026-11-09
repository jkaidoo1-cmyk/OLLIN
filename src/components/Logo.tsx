/**
 * Ollin ring mark — a forest-green ring with a diagonal cut-out at the
 * bottom-left and a bright green dot in the centre. Pure SVG so it stays
 * crisp at any size and inherits the surrounding text colour.
 */export function BrandMark({ className = "", onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden>
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <mask id="bm-n">
            <rect width="24" height="24" fill="#fff"/>
            <rect x="-4.6" y="-2.4" width="9" height="4.8" transform="translate(7.5 19.4) rotate(135)" fill="#000"/>
          </mask>
        </defs>
        <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="3.4" mask="url(#bm-n)"/>
        <circle cx="12" cy="12" r="3.4" fill={onDark ? "#7FE0A6" : "#3CC46F"}/>
      </svg>
    </span>
  );
}
