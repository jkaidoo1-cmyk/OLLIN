/* eslint-disable @next/next/no-img-element */

export function Logo({ className = "w-[35px] h-[35px]", onDark = false }: { className?: string; onDark?: boolean }) {
  if (onDark) {
    // White logo — reads directly on the green header, no badge needed.
    return (
      <img
        src="/logo.png"
        alt="OLLIN logo"
        className="w-[50px] h-[50px] object-contain"
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
