---
title: Packaging
description: How the widget is distributed today, and the package.json setup for publishing it to npm
---

# Packaging

## Where things stand

`@preview-feedback/widget` is **not published to npm**. In this repo it is a private workspace package
whose `exports` point at TypeScript source, so `import "@preview-feedback/widget"` only resolves
inside this monorepo (the dashboard uses it that way). Outside it, there is nothing to install.

The supported way to use the widget is the **script tag**: the Worker serves a built, minified
classic script at `/v1/widget.js`, and your page needs no build step and no dependency.

```html
<script src="https://YOUR-WORKER/v1/widget.js" defer></script>
<preview-feedback endpoint="https://YOUR-WORKER" slug="my-site" site-key="…"></preview-feedback>
```

That is also the right choice for a preview, because the script always matches the API it talks to.
The script registers `<preview-feedback>` and a `PreviewFeedback` global with `mount` and `define`, so
a bundled app can load it and then call `window.PreviewFeedback.mount({ endpoint, slug, siteKey })`
without any package.

## Other ways to get the source

- **Inside this monorepo:** add `"@preview-feedback/widget": "workspace:*"` to a package's
  dependencies. Your bundler must compile TypeScript (Vite, Astro and esbuild do).
- **Straight from GitHub (pnpm):** the repository is public, and pnpm can install one subdirectory of
  it, so no npm package is needed:

  ```json
  { "dependencies": { "@preview-feedback/widget": "github:danielrose7/preview-feedback#path:/packages/widget" } }
  ```

  Tested with pnpm 11: it installs the package with `lit`, and esbuild bundles
  `import { mount } from "@preview-feedback/widget"` (about 80 KB unminified). Caveats:
  - Pin it. A bare `github:…` follows the default branch and the lockfile records one commit, so
    use `#<tag-or-sha>&path:/packages/widget` once you want it to stay put.
  - Vite's dev server needs one line of config (below). Without it the toolbar never renders in
    `vite dev`, though `vite build` works.
  - You get TypeScript source, as in a workspace, so your bundler must compile `.ts` (Vite, Astro and
    esbuild do), and there are no published type declarations beyond what your compiler infers.
  - It is **not** a raw file URL. `raw.githubusercontent.com/…/index.ts` is one file with no
    `package.json` and no `lit`, so a package manager cannot install it. `npm` has no subdirectory
    selector for git dependencies (not tested here), so this route is pnpm-specific.
  - It installs from the repository's default branch at the time you add it, so it runs whatever is
    pushed there. Review changes before you update the pin.
- **A working example:** [`examples/react-vite`](https://github.com/danielrose7/preview-feedback/tree/main/examples/react-vite)
  is a React 19 + Vite app using exactly that dependency. It was run in Chrome against a real Worker,
  in `vite dev` and in a production build under StrictMode: the toolbar rendered, a pin posted from the
  page was stored anchored to its `data-section`, React kept working, and with no key nothing mounted.

  For Vite, set this, or `vite dev` throws Lit's "class field shadowing" error and renders nothing:

  ```ts
  // vite.config.ts
  export default defineConfig({
    plugins: [react()],
    optimizeDeps: {
      esbuildOptions: { tsconfigRaw: { compilerOptions: { useDefineForClassFields: false } } },
    },
  });
  ```

  Adding `useDefineForClassFields: false` to your own `tsconfig.json` was not enough in Vite 7.
- **Vendored copy:** copy `packages/widget/src` into your project and import `./src/index.ts`. It needs
  `lit` and, because of Lit's decorators, `useDefineForClassFields: false` in `tsconfig.json`.

## Publishing to npm

Not done. When there is a reason to (a bundled app that wants types and tree-shaking), this is the
`package.json` setup the package needs. Today's `exports` map and `private: true` are the two things
that stop it.

```json
{
  "name": "@your-scope/preview-feedback",
  "version": "0.1.0",
  "type": "module",
  "license": "MIT",
  "description": "The <preview-feedback> web component.",
  "repository": { "type": "git", "url": "git+https://github.com/danielrose7/preview-feedback.git", "directory": "packages/widget" },
  "sideEffects": ["./dist/index.js"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./widget.js": "./dist/widget.js"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "dependencies": { "lit": "^3.3.3" },
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "node build.mjs && node build-package.mjs",
    "prepublishOnly": "pnpm typecheck && pnpm test && pnpm build"
  }
}
```

What each part is for:

- **Remove `"private": true`**, and pick a scope you own. `@preview-feedback` on npm is only yours if you
  create that organisation; `publishConfig.access: "public"` is needed for a scoped public package.
- **`exports` to built files.** Publish compiled ESM and type declarations, not `.ts` source, so
  consumers do not need to compile your TypeScript or share its `tsconfig`. Today's build only makes the
  minified IIFE; a second step (`build-package.mjs`) would emit `dist/index.js` (esbuild, ESM, `lit`
  external) and `dist/index.d.ts` (`tsc --emitDeclarationOnly --declaration`).
- **`sideEffects`.** Importing the package registers the element, so that file must be listed or a
  bundler may drop a bare `import "…"` as unused.
- **`files`.** Ship only `dist`, the README and the licence; not tests, e2e or source.
- **`lit` as a dependency**, so a consumer's package manager dedupes it. Keep it out of the bundled ESM.
- **`prepublishOnly`** runs the same gate as CI, so a broken build cannot be published.

Then:

```sh
pnpm --filter @your-scope/preview-feedback build
pnpm --filter @your-scope/preview-feedback publish --dry-run   # check the file list first
pnpm --filter @your-scope/preview-feedback publish
```

Check the tarball with `pnpm pack` and open it: it should hold `dist/` and nothing else. A published
package is public and cannot be fully unpublished, so decide the name before the first release. The
repository is MIT licensed (`LICENSE`), which `files` should ship.

## Versioning against the Worker

The script tag always matches the Worker it comes from. A published package would not, so the widget and
API must keep their request shapes backwards compatible (the API is versioned under `/v1/`), and the
package's README should name the Worker versions it works with.
