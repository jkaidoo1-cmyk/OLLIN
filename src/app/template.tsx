import PageTransition from "@/components/PageTransition";

/**
 * Root template — Next.js remounts this on every navigation, which is what
 * lets the page-enter animation replay for each route change. PageTransition
 * choreographs the entrance (wrapper fade + staggered block rise); the
 * wrapper mirrors the layout's flex column so footer-pinning inside pages
 * (mt-auto, flex-1) keeps working exactly as before.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
