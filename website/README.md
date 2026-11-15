# Asterism website

The public landing page, built with Astro as a static site for GitHub Pages. English is served at `/` and Chinese at `/zh/`; all copy lives in `src/i18n/content.ts`.

```sh
npm install
npm run dev      # local preview
npm run build    # type check and write dist/
```

`SITE_URL` and `SITE_BASE` override the deployed origin and path. The defaults target the custom domain at `/`; a project page without a custom domain uses `SITE_BASE=/asterism/`.

The constellation mark is rendered from `packages/ui/src/brand/geometry.ts`, so the site builds from a repository checkout that includes that file. Download links bake in the newest published release's asset URLs at build time, refresh from GitHub in the browser when available, and fall back to the releases page.

`.github/workflows/pages.yml` builds and deploys the site when `main` changes the website, the shared brand geometry, or the workflow itself, and whenever a release is published. It can also be run manually.
