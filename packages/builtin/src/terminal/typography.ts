/** The host publishes font tokens at renderer startup; interactive terminals and images share the resolved values. */
export function terminalTypography(): { fontFamily: string; fontSize: number } {
  const style = getComputedStyle(document.documentElement);
  return {
    fontFamily: style.getPropertyValue("--app-font-terminal").trim(),
    fontSize: Number.parseFloat(style.getPropertyValue("--terminal-font-size")),
  };
}
