/** Read-only token/character counts share decimal engineering abbreviations; unit symbols do not change with the UI language. */
const countFormats = {
  auto: new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1, useGrouping: false }),
  exceptZero: new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1, useGrouping: false, signDisplay: "exceptZero" }),
};

export function formatCount(value: number, signDisplay: keyof typeof countFormats = "auto"): string {
  return countFormats[signDisplay].format(value).replace("K", "k").replace("B", "G");
}
