# Asterism identity assets

The official mark is a triangular constellation of three rounded six-point stars. The primary application icon uses deep green stars on a citron surface; the dark artwork reverses that contrast. The transparent monochrome mark preserves the same geometry without a backing tile or material effects.

## Asset set

| Asset | Purpose |
| --- | --- |
| `asterism-mark.svg` | Transparent monochrome mark, using `currentColor` with black as the standalone default. |
| `asterism.svg`, `asterism.png` | Primary icon with transparent outer padding and a subtle shadow. Used by the development Dock, light About page, and Linux launcher packaging. |
| `asterism-dark.svg`, `asterism-dark.png` | Dark counterpart with the same padding and proportions. The About page selects it in dark appearance. |
| `asterism-full.svg`, `asterism-full.png` | Primary tile filling the canvas, without an exterior shadow. Used for the Linux window icon and as the Windows ICO source. |
| `asterism.icns` | macOS application icon, containing standard and Retina sizes. |
| `asterism.ico` | Windows application icon, containing 16, 24, 32, 48, 64, 128, and 256 px images. |

PNG masters are 1024 × 1024. The macOS ICNS contains 16, 32, 128, 256, and 512 point images at 1× and 2×. System icons use the primary citron artwork; the dark files do not enable automatic operating-system appearance switching.

## Regeneration

From the repository root, run:

```sh
npm run icon
```

Generation requires macOS `iconutil` and `rsvg-convert` from librsvg. The build and packaging processes consume the checked-in assets and do not require these generation tools.

The interface component and export generator share the star contours and placement in `packages/ui/src/brand/geometry.ts`. `scripts/app-icon.ts` owns the surface palette, platform layouts, and file exports. Edit those sources and regenerate rather than editing individual generated files. This keeps interface marks, SVG masters, and raster platform assets aligned.

The primary surface runs from `#E7F5A3` to `#CBE66B`, with stars in `#203E35`. The dark surface runs from `#29483F` to `#142D27`, with stars in `#DCEF91`. Interface marks inherit the theme foreground rather than changing the global accent palette.
