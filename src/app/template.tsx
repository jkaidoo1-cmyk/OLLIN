/**
 * Root template — Next.js remounts this on every navigation, which is what
 * lets the page-enter animation replay for each route change. The wrapper
 * mirrors the layout's flex column so footer-pinning inside pages (mt-auto,
 * flex-1) keeps working exactly as before.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter flex flex-col grow">{children}</div>;
}
