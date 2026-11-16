/** Radix subtracts a screen-space origin but consumes layout-space distances. */
export function scrollbarPointerCoordinate(client: number, origin: number, scale: number): number {
  return origin + (client - origin) / scale;
}
