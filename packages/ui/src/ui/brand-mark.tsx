import type { SVGProps } from "react";
import { brandStarPath, brandStars } from "../brand/geometry";

/** Three six-point stars: the same constellation used by the platform application icon. */
export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    {brandStars.map(({ x, y }) => <path key={`${x},${y}`} d={brandStarPath} transform={`translate(${x} ${y})`} />)}
  </svg>;
}
