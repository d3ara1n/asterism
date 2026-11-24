// Official application artwork and platform exports. Geometry is shared with the interface BrandMark.
// Requires local rsvg-convert (Homebrew librsvg) and macOS iconutil; rerun only after changing the icon.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { applicationTempRoot } from "../src/storage/temporary.ts";
import { join, resolve } from "node:path";
import { brandStarPath, brandStars } from "../packages/ui/src/brand/geometry.ts";

const output = resolve(import.meta.dirname, "../assets/icon");
const starPaths = brandStars.map(({ x, y }) => `<path d="${brandStarPath}" transform="translate(${x} ${y})"/>`).join("\n    ");

interface Theme {
  /** Quiet surface shading; the silhouette carries the identity. */
  surface: [string, string];
  mark: string;
  edge: string;
}

const themes = {
  light: { surface: ["#E7F5A3", "#CBE66B"], mark: "#203E35", edge: "#F7FFDA" },
  dark: { surface: ["#29483F", "#142D27"], mark: "#DCEF91", edge: "#668677" },
} satisfies Record<string, Theme>;

interface Layout {
  /** Base side length and corner radius within the 1024 canvas. */
  body: number;
  radius: number;
  drop: boolean;
}

const layouts = {
  // macOS icon grid: center the 824 base with space around it for the shadow.
  mac: { body: 824, radius: 185, drop: true },
  // Canvas-filling variant for Windows and window icons.
  full: { body: 1024, radius: 230, drop: false },
} satisfies Record<string, Layout>;

function svg(theme: Theme, layout: Layout): string {
  const offset = (1024 - layout.body) / 2;
  const markSize = layout.body * 0.88;
  const markOffset = (1024 - markSize) / 2;
  const body = `<rect x="${offset}" y="${offset}" width="${layout.body}" height="${layout.body}" rx="${layout.radius}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
  <linearGradient id="surface" x1="0" y1="0" x2="0.65" y2="1"><stop stop-color="${theme.surface[0]}"/><stop offset="1" stop-color="${theme.surface[1]}"/></linearGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${theme.edge}" stop-opacity="0.7"/><stop offset="1" stop-color="${theme.edge}" stop-opacity="0"/></linearGradient>
  <filter id="shadow" x="-25%" y="-25%" width="150%" height="160%"><feGaussianBlur stdDeviation="12"/></filter>
</defs>
${layout.drop ? `${body} fill="#12271F" opacity="0.18" transform="translate(0 12)" filter="url(#shadow)"/>` : ""}
${body} fill="url(#surface)"/>
<rect x="${offset + 2}" y="${offset + 2}" width="${layout.body - 4}" height="${layout.body - 4}" rx="${layout.radius - 2}" fill="none" stroke="url(#rim)" stroke-width="3"/>
<g transform="translate(${markOffset} ${markOffset}) scale(${markSize / 24})" fill="${theme.mark}">
    ${starPaths}
</g>
</svg>
`;
}

function rasterize(source: string, target: string, size: number): void {
  execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), source, "-o", target]);
}

/** ICO embeds each size as PNG; 256 is represented as 0 in directory entries. */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(image => image.data)]);
}

mkdirSync(output, { recursive: true });
// Transparent, monochrome artwork for reuse outside the application component.
writeFileSync(join(output, "asterism-mark.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 24 24" fill="currentColor">
    ${starPaths}
</svg>
`);
const sources = {
  "asterism.svg": svg(themes.light, layouts.mac),
  "asterism-dark.svg": svg(themes.dark, layouts.mac),
  "asterism-full.svg": svg(themes.light, layouts.full),
};
for (const [name, content] of Object.entries(sources)) {
  writeFileSync(join(output, name), content);
  rasterize(join(output, name), join(output, name.replace(/\.svg$/u, ".png")), 1024);
}

const temporaryRoot = join(applicationTempRoot(), "dev", "build");
mkdirSync(temporaryRoot, { recursive: true, mode: 0o700 });
const work = mkdtempSync(join(temporaryRoot, "icon-"));
try {
  // macOS: pass all iconset sizes to iconutil for packaging.
  const iconset = join(work, "asterism.iconset");
  mkdirSync(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    rasterize(join(output, "asterism.svg"), join(iconset, `icon_${size}x${size}.png`), size);
    rasterize(join(output, "asterism.svg"), join(iconset, `icon_${size}x${size}@2x.png`), size * 2);
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", join(output, "asterism.icns")]);

  // Windows: write all sizes of the canvas-filling variant into one ICO.
  const images = [16, 24, 32, 48, 64, 128, 256].map(size => {
    const file = join(work, `full-${size}.png`);
    rasterize(join(output, "asterism-full.svg"), file, size);
    return { size, data: readFileSync(file) };
  });
  writeFileSync(join(output, "asterism.ico"), ico(images));
} finally {
  rmSync(work, { recursive: true, force: true });
}
