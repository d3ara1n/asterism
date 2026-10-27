import type { SVGProps } from "react";

/** Application mark: a wireframe of objects and connections, taken from the interaction prototype. */
export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M4 5h16M4 12h16M4 19h16M7 3v18M17 3v18" />
    <path d="m4 5 16 14M4 19 20 5" />
  </svg>;
}
