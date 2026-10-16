# React + Vite example

A React 19 app that loads the widget as a **git dependency**, with no npm package. The widget mounts
from a component in `useEffect`, so it is cleaned up when the component unmounts (React StrictMode runs
the effect twice in development and leaves exactly one `<preview-feedback>`).

```json
"@preview-feedback/widget": "github:danielrose7/preview-feedback#path:/packages/widget"
```

Pin that to a tag or commit for anything real (`#<ref>&path:/packages/widget`), because the bare form
follows the default branch.

## Run it

```sh
pnpm install
pnpm feedback register react-example     # in the preview-feedback repo; prints the site key
VITE_FEEDBACK_ENDPOINT=http://localhost:8787 VITE_FEEDBACK_KEY=… pnpm dev
```

Without `VITE_FEEDBACK_KEY` nothing mounts. `VITE_FEEDBACK_SLUG` overrides the slug (`react-example`).

## The one config line that matters

`vite.config.ts` sets `optimizeDeps.esbuildOptions.tsconfigRaw` to `useDefineForClassFields: false`.
The widget ships TypeScript source that relies on Lit's reactive properties, and Vite's dev pre-bundler
does not read the widget's own tsconfig. Without that line, `vite dev` throws Lit's "class field
shadowing" error and the toolbar never renders. `vite build` works either way.

This is not part of the pnpm workspace, so the root `pnpm install` and `pnpm test` do not touch it.
