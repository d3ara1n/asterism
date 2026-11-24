import { describe, expect, it } from "vitest";
import { formatFileSize } from "./format-file-size";

const i18n = (locale: string) => ({
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, options).format(value),
});

describe("File sizes", () => {
  it("converts bytes to binary units instead of abbreviating the byte count in Chinese", () => {
    expect(formatFileSize(i18n("zh-Hans"), 170_000)).toBe("166\u00a0KiB");
  });

  it("uses powers of 1024 rather than decimal thresholds", () => {
    expect(formatFileSize(i18n("en"), 1_000)).toBe("1,000\u00a0B");
    expect(formatFileSize(i18n("en"), 1_024)).toBe("1\u00a0KiB");
    expect(formatFileSize(i18n("en"), 8_388_608)).toBe("8\u00a0MiB");
  });

  it("localizes the scaled number but keeps the same unit symbol", () => {
    expect(formatFileSize(i18n("de"), 1_536)).toBe("1,5\u00a0KiB");
  });
});
