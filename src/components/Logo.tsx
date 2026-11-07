import Image from "next/image";

/** Rounded-square brand mark — the green tile with the white ring. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="7.2" stroke="currentColor" strokeWidth="3.1" />
      </svg>
    </span>
  );
}

export function Logo({ className = "w-[35px] h-[35px]", onDark = false }: { className?: string; onDark?: boolean }) {
  if (onDark) {
    return (
      <Image
        src="/logo.png"
        alt="OLLIN logo"
        width={50}
        height={50}
        className="w-[50px] h-[50px] object-contain"
        draggable={false}
      />
    );
  }
  return (
    <Image
      src="/logo-ink.png"
      alt="OLLIN logo"
      width={50}
      height={50}
      className={`${className} object-contain`}
      draggable={false}
    />
  );
}
