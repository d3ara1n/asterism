# Asterism website

The public landing page, built with Astro as a static site for GitHub Pages. English is served at `/` and Chinese at `/zh/`; all copy lives in `src/i18n/content.ts`.

```sh
npm install
npm run dev      # local preview
npm run build    # type check and write dist/
```

`SITE_URL` and `SITE_BASE` override the deployed origin and path. The defaults target the custom domain at `/`; a project page without a custom domain uses `SITE_BASE=/asterism/`.

The constellation mark is rendered from `packages/ui/src/brand/geometry.ts`, so the site builds from a repository checkout that includes that file.

Platform download links use GitHub's `/releases/latest/download/` URLs with fixed asset names: `Asterism-mac-arm64.dmg`, `Asterism-win-x64.exe`, and `Asterism-linux-x86_64.AppImage`. GitHub resolves these links to the latest stable release; prereleases are not recommended downloads. Before the first stable release with those names is published, these links do not resolve. The site does not display a version number or query release metadata during builds or in visitors' browsers. The releases index remains available for release notes and other builds.

The website workflow builds from `main` when the website, shared brand geometry, or website workflow changes, and supports manual runs. Publishing or promoting an application release does not rebuild the website; existing download links resolve to the latest stable release without redeployment.
