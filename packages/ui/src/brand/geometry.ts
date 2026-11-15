/** Shared artwork in a 24-unit square, used by the interface and platform icon generator. */
export const brandStarPath = "M-0.158 -3.579Q0.000 -4.000 0.158 -3.579 L0.625 -2.334Q0.910 -1.576 1.709 -1.709 L3.020 -1.926Q3.464 -2.000 3.178 -1.652 L2.334 -0.626Q1.820 0.000 2.334 0.626 L3.178 1.652Q3.464 2.000 3.020 1.926 L1.709 1.709Q0.910 1.576 0.625 2.334 L0.158 3.579Q0.000 4.000 -0.158 3.579 L-0.625 2.334Q-0.910 1.576 -1.709 1.709 L-3.020 1.926Q-3.464 2.000 -3.178 1.652 L-2.334 0.626Q-1.820 0.000 -2.334 -0.626 L-3.178 -1.652Q-3.464 -2.000 -3.020 -1.926 L-1.709 -1.709Q-0.910 -1.576 -0.625 -2.334Z";

/** Optical placement keeps the three separate silhouettes balanced above the tile center. */
export const brandStars = [
  { x: 12, y: 6.8 },
  { x: 6.7, y: 16 },
  { x: 17.3, y: 16 },
] as const;
