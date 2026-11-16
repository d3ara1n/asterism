# Asterism website

The public landing page, built with Astro as a static site for GitHub Pages. English is served at `/` and Chinese at `/zh/`; all copy lives in `src/i18n/content.ts`.

```sh
npm install
npm run dev      # local preview
npm run build    # type check and write dist/
```

`SITE_URL` and `SITE_BASE` override the deployed origin and path. The defaults target the custom domain at `/`; a project page without a custom domain uses `SITE_BASE=/asterism/`.

The constellation mark is rendered from `packages/ui/src/brand/geometry.ts`, so the site builds from a repository checkout that includes that file. The version label and download links are resolved from the newest published release at build time and embedded in static HTML. Visitors do not query GitHub for release metadata. If release metadata is unavailable, the version label is hidden and download links fall back to the releases page.

The website workflow builds from `main` when the website, shared brand geometry, or website workflow changes, and on manually published releases. Automated release publication explicitly calls the reusable website workflow after publishing, including prerelease promotion, because release events created with the default `GITHUB_TOKEN` do not trigger another workflow. The website workflow also supports manual runs. Version and download changes become visible after deployment; an already-open page needs a reload.
