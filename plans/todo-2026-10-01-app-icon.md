# 应用图标

> 立案 2026-10-01。暂缓到首次打包分发前；界面内标识使用 `src/renderer/shared/ui/brand-mark.tsx` 的对象与连线线框。正式应用图标独立设计，不把旧织机母题作为既定方向。

## 待办

- [ ] 确定符合 Atelier / 工坊的应用图标；图形母题、圆角方底、深青与白的配色方向由用户确认，24px 界面线框不直接放大使用。
- [ ] 生成 macOS `.icns`、Windows `.ico`、Linux `.png`，接入 `forge.config.ts` 与 BrowserWindow 图标。
- [ ] 用户在各平台 Dock/任务栏验收；不为图标编写测试。
