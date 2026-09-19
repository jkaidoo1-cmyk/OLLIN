/* eslint-disable @next/next/no-img-element */

export function Logo({ className = "w-6 h-6", onDark = false }: { className?: string; onDark?: boolean }) {
  if (onDark) {
    // White logo — reads directly on the green header, no badge needed.
    return (
      <img
        src="/logo.png"
        alt="OLLIN logo"
        className="w-7 h-7 object-contain"
        draggable={false}
      />
    );
  }
  return (
    <img
      src="/logo.png"
      alt="OLLIN logo"
      className={`${className} object-contain`}
      draggable={false}
    />
  );
}
