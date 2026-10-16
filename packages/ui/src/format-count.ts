/** 只读 token／字数共用十进制工程缩写；单位符号不随界面语言变化。 */
const countFormats = {
  auto: new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1, useGrouping: false }),
  exceptZero: new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1, useGrouping: false, signDisplay: "exceptZero" }),
};

export function formatCount(value: number, signDisplay: keyof typeof countFormats = "auto"): string {
  return countFormats[signDisplay].format(value).replace("K", "k").replace("B", "G");
}
