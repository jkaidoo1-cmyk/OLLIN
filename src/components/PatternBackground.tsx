/**
 * Engineering/education-themed background pattern.
 * Small icons tightly packed — WhatsApp doodle style.
 * 80x80 tile, icons scaled to ~50-60%.
 */
export default function PatternBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        style={{ opacity: 0.10 }}
      >
        <defs>
          <pattern id="edu-pattern" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
            {/* Pencil */}
            <g transform="translate(8,10) rotate(-30) scale(0.54)" stroke="#333" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="0" y1="0" x2="0" y2="22" />
              <line x1="-2.5" y1="22" x2="0" y2="28" />
              <line x1="2.5" y1="22" x2="0" y2="28" />
              <line x1="-2.5" y1="0" x2="2.5" y2="0" />
              <line x1="-2.5" y1="5" x2="2.5" y2="5" />
            </g>

            {/* Book */}
            <g transform="translate(40,5) scale(0.48)" stroke="#333" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M0,4 L0,26 L26,26 L26,4 Z" />
              <path d="M0,4 L13,1.5 L26,4" />
              <line x1="13" y1="1.5" x2="13" y2="26" />
            </g>

            {/* Gear */}
            <g transform="translate(68,10) scale(0.48)" stroke="#333" strokeWidth="1.2" fill="none" strokeLinecap="round">
              <circle cx="0" cy="0" r="10" />
              <circle cx="0" cy="0" r="4" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                <line
                  key={deg}
                  x1={Math.cos((deg * Math.PI) / 180) * 10}
                  y1={Math.sin((deg * Math.PI) / 180) * 10}
                  x2={Math.cos((deg * Math.PI) / 180) * 14}
                  y2={Math.sin((deg * Math.PI) / 180) * 14}
                  strokeWidth="2.5"
                />
              ))}
            </g>

            {/* Triangle ruler */}
            <g transform="translate(15,30) scale(0.46)" stroke="#333" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M0,0 L26,0 L0,26 Z" />
              <path d="M4,4 L4,11 L11,4" />
            </g>

            {/* Compass */}
            <g transform="translate(50,32) scale(0.46)" stroke="#333" strokeWidth="1.2" fill="none" strokeLinecap="round">
              <path d="M0,22 A22,22 0 0,1 22,0" />
              <line x1="0" y1="22" x2="22" y2="0" />
              <circle cx="0" cy="22" r="1.5" fill="#333" />
            </g>

            {/* Helmet */}
            <g transform="translate(5,55) scale(0.46)" stroke="#333" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M-14,10 Q-14,-6 0,-10 Q14,-6 14,10" />
              <line x1="-17" y1="10" x2="17" y2="10" />
              <line x1="-12" y1="10" x2="-12" y2="15" />
              <line x1="12" y1="10" x2="12" y2="15" />
            </g>

            {/* Lightbulb */}
            <g transform="translate(35,55) scale(0.46)" stroke="#333" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M0,-12 Q-10,-12 -10,-2 Q-10,4 0,6 Q10,4 10,-2 Q10,-12 0,-12 Z" />
              <line x1="-4" y1="9" x2="4" y2="9" />
              <line x1="-3" y1="12" x2="3" y2="12" />
              <line x1="0" y1="-6" x2="0" y2="-2" />
            </g>

            {/* Atom */}
            <g transform="translate(65,55) scale(0.42)" stroke="#333" strokeWidth="0.8" fill="none" strokeLinecap="round">
              <ellipse cx="0" cy="0" rx="12" ry="5" />
              <ellipse cx="0" cy="0" rx="12" ry="5" transform="rotate(60)" />
              <ellipse cx="0" cy="0" rx="12" ry="5" transform="rotate(120)" />
              <circle cx="0" cy="0" r="2" fill="#333" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#edu-pattern)" />
      </svg>
    </div>
  );
}
