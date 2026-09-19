/* eslint-disable @next/next/no-img-element */

export function Logo({ className = "w-6 h-6", onDark = false }: { className?: string; onDark?: boolean }) {
  if (onDark) {
    // White circular badge so the dark-green mark stays visible on the green header.
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white shrink-0">
        <img
          src="/logo.png"
          alt="OLLIN logo"
          className={`w-5 h-5 object-contain`}
          draggable={false}
        />
      </span>
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
