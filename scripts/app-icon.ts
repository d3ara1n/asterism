// 应用图标的唯一真值：几何与配色在此声明，生成 assets/icon/ 下的源图与各平台产物。
// 依赖本机 rsvg-convert（Homebrew librsvg）与 macOS iconutil，仅在修改图标后重新运行。
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const output = resolve(import.meta.dirname, "../assets/icon");
const BLUE = "#2F6BFF";

interface Theme {
  /** 底板左上到右下的渐变。 */
  stops: [string, string];
  /** 画框玻璃在底板上的叠色与不透明度。 */
  glass: [string, number];
  /** 玻璃最上层的白色磨砂不透明度。 */
  frost: number;
  /** 画框投影颜色与不透明度。 */
  shadow: [string, number];
}

const themes = {
  light: { stops: ["#F2F6FF", "#D9E5FF"], glass: ["#FFFFFF", 0.45], frost: 0.3, shadow: ["#1B3A8C", 0.14] },
  dark: { stops: ["#1E2A4A", "#0E1428"], glass: ["#FFFFFF", 0.16], frost: 0.12, shadow: ["#000000", 0.35] },
} satisfies Record<string, Theme>;

interface Layout {
  /** 底板边长与圆角（1024 画布内）。 */
  body: number;
  radius: number;
  /** 底板下方的系统式投影。 */
  drop: boolean;
}

const layouts = {
  // macOS 图标网格：824 底板居中，四周留出投影空间。
  mac: { body: 824, radius: 185, drop: true },
  // Windows 与 Linux：底板铺满画布，不带投影。
  full: { body: 1024, radius: 230, drop: false },
} satisfies Record<string, Layout>;

const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;

// 内容几何（1024 坐标，按底板比例缩放）：厚画框在前，画布向右上探出，画中连线镂空。
const frame = { x: 172, y: 262, w: 640, h: 520, r: 150, t: 120 };
const canvas = { x: 252, y: 172, w: 600, h: 520, r: 110 };
const ring = rr(frame.x, frame.y, frame.w, frame.h, frame.r)
  + rr(frame.x + frame.t, frame.y + frame.t, frame.w - 2 * frame.t, frame.h - 2 * frame.t, frame.r - frame.t + 20);
const painting = rr(canvas.x, canvas.y, canvas.w, canvas.h, canvas.r);
const link = `<path d="M395 560 L590 445" stroke="#000" stroke-width="34" stroke-linecap="round"/><circle cx="395" cy="560" r="42" fill="#000"/><circle cx="590" cy="445" r="42" fill="#000"/>`;

function svg(theme: Theme, layout: Layout): string {
  const offset = (1024 - layout.body) / 2;
  const scale = layout.body / 1024;
  const body = `<rect x="${offset}" y="${offset}" width="${layout.body}" height="${layout.body}" rx="${layout.radius}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${theme.stops[0]}"/><stop offset="1" stop-color="${theme.stops[1]}"/></linearGradient>
  <filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="30"/></filter>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter>
  <filter id="drop" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
  <clipPath id="ring"><path d="${ring}" clip-rule="evenodd"/></clipPath>
  <mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="#fff"/>${link}</mask>
</defs>
${layout.drop ? `${body} fill="#000" opacity="0.18" transform="translate(0 12)" filter="url(#drop)"/>` : ""}
${body} fill="url(#bg)"/>
<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
  <g mask="url(#cut)">
    <path d="${rr(canvas.x, canvas.y + 18, canvas.w, canvas.h, canvas.r)}" fill="${BLUE}" opacity="0.22" filter="url(#soft)"/>
    <path d="${painting}" fill="${BLUE}"/>
  </g>
  <path d="${ring}" fill-rule="evenodd" fill="${theme.shadow[0]}" opacity="${theme.shadow[1]}" filter="url(#soft)" transform="translate(0 16)"/>
  <g clip-path="url(#ring)">
    <rect width="1024" height="1024" fill="url(#bg)"/>
    <rect width="1024" height="1024" fill="${theme.glass[0]}" opacity="${theme.glass[1]}"/>
    <g filter="url(#blur)" opacity="0.9"><path d="${painting}" fill="${BLUE}"/></g>
    <rect width="1024" height="1024" fill="#fff" opacity="${theme.frost}"/>
  </g>
  <path d="${ring}" fill-rule="evenodd" fill="none" stroke="#fff" stroke-width="4" opacity="0.9"/>
</g>
</svg>
`;
}

function rasterize(source: string, target: string, size: number): void {
  execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), source, "-o", target]);
}

/** ICO 以 PNG 内嵌各尺寸；256 在目录项中记为 0。 */
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
const sources = {
  "atelier.svg": svg(themes.light, layouts.mac),
  "atelier-dark.svg": svg(themes.dark, layouts.mac),
  "atelier-full.svg": svg(themes.light, layouts.full),
};
for (const [name, content] of Object.entries(sources)) {
  writeFileSync(join(output, name), content);
  rasterize(join(output, name), join(output, name.replace(/\.svg$/u, ".png")), 1024);
}

const work = mkdtempSync(join(tmpdir(), "atelier-icon-"));
try {
  // macOS：iconset 全尺寸交给 iconutil 打包。
  const iconset = join(work, "atelier.iconset");
  mkdirSync(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    rasterize(join(output, "atelier.svg"), join(iconset, `icon_${size}x${size}.png`), size);
    rasterize(join(output, "atelier.svg"), join(iconset, `icon_${size}x${size}@2x.png`), size * 2);
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", join(output, "atelier.icns")]);

  // Windows：铺满版各尺寸写入同一个 ICO。
  const images = [16, 24, 32, 48, 64, 128, 256].map(size => {
    const file = join(work, `full-${size}.png`);
    rasterize(join(output, "atelier-full.svg"), file, size);
    return { size, data: readFileSync(file) };
  });
  writeFileSync(join(output, "atelier.ico"), ico(images));
} finally {
  rmSync(work, { recursive: true, force: true });
}
