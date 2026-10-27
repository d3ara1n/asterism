import type { MermaidConfig } from "mermaid";
import { useLayoutEffect, useState, type RefObject } from "react";

/** Mermaid color calculations require actual color values; values come from public host tokens without depending on the application's settings implementation. */
function diagramTheme(element: HTMLElement): MermaidConfig {
  const root = getComputedStyle(document.documentElement);
  const text = getComputedStyle(element);
  const token = (name: string) => root.getPropertyValue(`--${name}`).trim();
  const card = token("card"), foreground = token("foreground"), border = token("border");
  const muted = token("muted"), secondary = token("secondary"), line = token("muted-foreground");
  const selected = token("selected"), primary = token("primary"), primaryText = token("primary-text");
  const fontSize = parseFloat(text.fontSize);
  const palette = Array.from({ length: 8 }, (_, index) => token(`chart-${index + 1}`));
  return {
    theme: "base", look: "classic", fontFamily: text.fontFamily,
    themeVariables: {
      darkMode: root.colorScheme === "dark",
      background: card, fontFamily: text.fontFamily, fontSize: text.fontSize,
      radius: parseFloat(token("radius")), strokeWidth: 1, useGradient: false, dropShadow: "none",
      primaryColor: secondary, primaryTextColor: foreground, primaryBorderColor: border,
      secondaryColor: selected, secondaryTextColor: token("selected-foreground"), secondaryBorderColor: border,
      tertiaryColor: card, tertiaryTextColor: foreground, tertiaryBorderColor: border,
      textColor: foreground, titleColor: foreground, lineColor: line, arrowheadColor: line,
      mainBkg: secondary, nodeBkg: secondary, nodeTextColor: foreground, nodeBorder: border,
      clusterBkg: card, clusterBorder: border, defaultLinkColor: line, edgeLabelBackground: card,
      noteBkgColor: muted, noteTextColor: foreground, noteBorderColor: border,
      actorBkg: secondary, actorBorder: border, actorTextColor: foreground, actorLineColor: border,
      signalColor: line, signalTextColor: foreground,
      labelBoxBkgColor: card, labelBoxBorderColor: border, labelTextColor: foreground, loopTextColor: foreground,
      activationBkgColor: selected, activationBorderColor: primary, sequenceNumberColor: card,
      classText: foreground, rowOdd: card, rowEven: muted,
      stateBkg: secondary, stateLabelColor: foreground, labelBackgroundColor: card,
      transitionColor: line, transitionLabelColor: foreground,
      compositeBackground: card, compositeTitleBackground: muted, compositeBorder: border, altBackground: muted,
      sectionBkgColor: muted, sectionBkgColor2: card, altSectionBkgColor: card, excludeBkgColor: muted,
      taskBkgColor: secondary, taskBorderColor: border, taskTextColor: foreground,
      taskTextOutsideColor: foreground, taskTextLightColor: foreground, taskTextDarkColor: foreground,
      taskTextClickableColor: primaryText, activeTaskBkgColor: selected, activeTaskBorderColor: primary,
      doneTaskBkgColor: muted, doneTaskBorderColor: border, gridColor: border,
      critBkgColor: token("destructive"), critBorderColor: token("destructive"), todayLineColor: primary,
      personBkg: secondary, personBorder: border,
      // Groups in structural diagrams use neutral surfaces; quantitative charts use the design system's category colors.
      ...Object.fromEntries(Array.from({ length: 12 }, (_, index) => [
        [`cScale${index}`, secondary], [`cScaleLabel${index}`, foreground],
        [`cScalePeer${index}`, border], [`pie${index + 1}`, palette[index % palette.length]],
      ]).flat()),
      pieTitleTextColor: foreground, pieTitleTextSize: text.fontSize,
      pieLegendTextColor: foreground, pieLegendTextSize: text.fontSize,
      pieSectionTextColor: foreground, pieSectionTextSize: text.fontSize,
      pieStrokeColor: card, pieStrokeWidth: "1px", pieOuterStrokeColor: border, pieOuterStrokeWidth: "1px", pieOpacity: "1",
      xyChart: {
        backgroundColor: card, titleColor: foreground, dataLabelColor: foreground, legendTextColor: foreground,
        xAxisTitleColor: foreground, xAxisLabelColor: line, xAxisTickColor: border, xAxisLineColor: border,
        yAxisTitleColor: foreground, yAxisLabelColor: line, yAxisTickColor: border, yAxisLineColor: border,
        plotColorPalette: palette.join(","),
      },
    },
    flowchart: { nodeSpacing: fontSize * 2.5, rankSpacing: fontSize * 3, padding: fontSize, diagramPadding: fontSize },
    sequence: {
      actorFontFamily: text.fontFamily, noteFontFamily: text.fontFamily, messageFontFamily: text.fontFamily,
      actorFontSize: fontSize, noteFontSize: fontSize, messageFontSize: fontSize,
      actorMargin: fontSize * 3, messageMargin: fontSize * 2.5, boxMargin: fontSize,
      width: fontSize * 10, height: fontSize * 3.5, diagramMarginX: fontSize, diagramMarginY: fontSize,
    },
    class: { nodeSpacing: fontSize * 2.5, rankSpacing: fontSize * 3, padding: fontSize },
    er: { fontSize, nodeSpacing: fontSize * 2.5, rankSpacing: fontSize * 3, entityPadding: fontSize },
  };
}

/** The host writes appearance to :root; the diagram theme updates only when resolved values of relevant tokens change. */
export function useMermaidTheme(container: RefObject<HTMLDivElement | null>): MermaidConfig | null {
  const [theme, setTheme] = useState<MermaidConfig | null>(null);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    let previous = "";
    const update = () => {
      const next = diagramTheme(element);
      const signature = JSON.stringify(next);
      if (signature === previous) return;
      previous = signature;
      setTheme(next);
    };
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-mode"] });
    update();
    return () => observer.disconnect();
  }, [container]);
  return theme;
}
