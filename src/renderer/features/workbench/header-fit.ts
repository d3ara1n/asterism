/** Natural widths of the title row's parts; 0 marks an absent part. */
export interface HeaderWidths {
  title: number;
  prefix: number;
  summary: number;
  statusIcon: number;
  statusLabel: number;
}
export interface HeaderFit {
  prefix: boolean;
  summary: boolean;
  statusLabel: boolean;
}
const collapseOrder = ["prefix", "summary", "statusLabel"] as const;

/**
 * Hide optional parts in order (prefix, then summary, then the status label) until the row fits the available width.
 * The status icon stays, and the title truncates only after every optional part is hidden.
 */
export function fitHeader(available: number, widths: HeaderWidths, gap: number, labelGap: number): HeaderFit {
  const fit: HeaderFit = { prefix: widths.prefix > 0, summary: widths.summary > 0, statusLabel: widths.statusIcon > 0 && widths.statusLabel > 0 };
  const required = () => {
    const status = widths.statusIcon > 0 ? widths.statusIcon + (fit.statusLabel ? labelGap + widths.statusLabel : 0) : 0;
    const parts = [widths.title, fit.prefix ? widths.prefix : 0, status, fit.summary ? widths.summary : 0].filter(width => width > 0);
    return parts.reduce((total, width) => total + width, 0) + gap * Math.max(0, parts.length - 1);
  };
  for (const part of collapseOrder) {
    if (required() <= available) break;
    fit[part] = false;
  }
  return fit;
}
