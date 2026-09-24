/**
 * Shared page banner — the green identity treatment from the profile page,
 * applied app-wide: deep green surface, soft circular accents, pill badges,
 * optional actions on the right / below on mobile.
 */
export default function PageBanner({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-[#006633] rounded-lg p-5 sm:p-6 relative overflow-hidden">
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5" aria-hidden />
      <div className="absolute -bottom-14 -left-6 w-36 h-36 rounded-full bg-white/5" aria-hidden />
      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <span className="w-10 h-10 sm:hidden rounded-lg bg-white/15 flex items-center justify-center shrink-0 text-white">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-white truncate">{title}</h1>
            {subtitle && <p className="text-sm text-white/70 mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>
        )}
      </div>
    </div>
  );
}

/** Light action button for use inside the green banner. */
export function BannerButton({
  href,
  onClick,
  children,
  variant = "solid",
}: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  variant?: "solid" | "ghost";
}) {
  const cls =
    variant === "solid"
      ? "inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-white text-[#006633] rounded-md hover:bg-[#f0f8f2] transition-colors no-underline"
      : "inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-white/15 text-white rounded-md hover:bg-white/25 transition-colors no-underline";
  if (href) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
