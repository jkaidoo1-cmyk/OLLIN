/* eslint-disable @next/next/no-img-element */

export function Logo({ className = "w-[29px] h-[29px]", onDark = false }: { className?: string; onDark?: boolean }) {
  if (onDark) {
    // White logo — reads directly on the green header, no badge needed.
    return (
      <img
        src="/logo.png"
        alt="OLLIN logo"
        className="w-[34px] h-[34px] object-contain"
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
