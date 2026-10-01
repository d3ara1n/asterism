# 应用图标

> 立案 2026-10-01。暂缓到首次打包分发前；界面内标识已使用 `src/renderer/shared/ui/weft-mark.tsx`（取自交互原型的经纬线框）。

## 待办

- [ ] 以经纬线框为母题重绘应用图标：圆角方底、深青与白的配色方向由用户确认；24px 线框不直接放大使用。
- [ ] 生成 macOS `.icns`、Windows `.ico`、Linux `.png`，接入 `forge.config.ts` 与 BrowserWindow 图标。
- [ ] 用户在各平台 Dock/任务栏验收；不为图标编写测试。
