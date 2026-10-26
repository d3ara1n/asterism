/** 宿主在渲染器启动时发布字体 token；交互终端与图片共用解析结果。 */
export function terminalTypography(): { fontFamily: string; fontSize: number } {
  const style = getComputedStyle(document.documentElement);
  return {
    fontFamily: style.getPropertyValue("--app-font-terminal").trim(),
    fontSize: Number.parseFloat(style.getPropertyValue("--terminal-font-size")),
  };
}
