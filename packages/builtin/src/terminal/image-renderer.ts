import type { RendererPrepareContext } from "@asterism-app/sdk/renderer";
import { CompleteTerminalImage, TerminalImageRequested, type TerminalImage } from "./contract.ts";
import { terminalTypography } from "./typography.ts";

/** The canvas renders only the parsed character grid; the screenshot service is independent of card mounting. */
export function renderTerminalImage(screen: TerminalImage): string {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable.");
  const { fontFamily, fontSize } = terminalTypography();
  context.font = `${fontSize}px ${fontFamily}`;
  const width = Math.ceil(context.measureText("M").width), height = Math.ceil(fontSize * 1.5), padding = 8;
  canvas.width = screen.cols * width + padding * 2;
  canvas.height = screen.rows * height + padding * 2;
  context.fillStyle = "#1e1e1e"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.textBaseline = "middle";
  for (let row = 0; row < screen.rows; row++) for (let col = 0; col < screen.cols; col++) {
    const cell = screen.cells[row]?.[col];
    if (!cell || cell.width === 0) continue;
    const x = padding + col * width, y = padding + row * height, cellWidth = width * cell.width;
    context.fillStyle = cell.bg; context.fillRect(x, y, cellWidth, height);
    context.save(); context.beginPath(); context.rect(x, y, cellWidth, height); context.clip();
    context.font = `${cell.italic ? "italic " : ""}${cell.bold ? "bold " : ""}${fontSize}px ${fontFamily}`;
    context.fillStyle = cell.fg; context.fillText(cell.text, x, y + height / 2);
    if (cell.underline) context.fillRect(x, y + height - 3, cellWidth, 1);
    if (cell.strike) context.fillRect(x, y + height / 2, cellWidth, 1);
    context.restore();
  }
  if (screen.cursor.visible) {
    context.strokeStyle = "#d4d4d4"; context.lineWidth = 1;
    context.strokeRect(padding + Math.min(screen.cols - 1, screen.cursor.x) * width + .5, padding + screen.cursor.y * height + .5, width - 1, height - 1);
  }
  return canvas.toDataURL("image/png").split(",")[1]!;
}
export async function prepareTerminalImages({ events, calls, signal }: RendererPrepareContext) {
  await events.subscribe(TerminalImageRequested, { signal }, async ({ data }) => {
    let png: string | null = null, error: string | null = null;
    try { await document.fonts.ready; signal.throwIfAborted(); png = renderTerminalImage(data.screen); }
    catch (failure) { error = String(failure); }
    await calls.invoke(CompleteTerminalImage, { id: data.id, png, error }, { signal });
  }).ready;
}
