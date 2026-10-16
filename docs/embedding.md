---
title: Embedding
description: Attributes, the bundler API, and how pins anchor to the page
---

# Embedding the widget

## What you need

1. A running Worker and its address: the **endpoint**.
2. A **slug** for the site and its **site key**, from `pnpm feedback register <slug>`.
3. The page's origin in the Worker's `ALLOWED_ORIGINS`.

## Script tag (any site, any framework)

```html
<script src="https://YOUR-WORKER/v1/widget.js" defer></script>
<preview-feedback endpoint="https://YOUR-WORKER" slug="my-site" site-key="…"></preview-feedback>
```

The script is a classic IIFE, so it loads cross-origin without CORS headers. It registers the
`<preview-feedback>` element and a `PreviewFeedback` global (`mount`, `define`). It is about 19 KB
gzipped (Lit included) and draws inside a shadow root, so the host page's CSS cannot touch it.

## Attributes

| Attribute | Required | Meaning |
| --- | --- | --- |
| `endpoint` | yes | The API origin. |
| `slug` | yes | The site's slug. |
| `site-key` | yes | The key from `register`. Anyone holding the preview can read it; that is the model. |
| `build` | no | A build id stored with each comment, so you know which version was reviewed. |
| `pages` | no | The site's nav hrefs, comma separated or a JSON array, so the inbox lists pages in that order. |

Changing an attribute remounts the widget. Properties set through `element.config = { … }` win over
attributes. A second `<preview-feedback>` on a page is ignored with a console warning.

## From a bundler

The widget is not on npm yet, so load the script tag and use its global:

```ts
const undo = window.PreviewFeedback.mount({ endpoint, slug, siteKey }); // returns a function that removes it
```

Importing `@preview-feedback/widget` only works inside this monorepo. See [Packaging](/docs/packaging)
for the options and the `package.json` setup for publishing it.

## Examples

- [`apps/demo`](https://github.com/danielrose7/preview-feedback/tree/main/apps/demo): an Astro site
  (Acme Anvils) that emits the element and script only when `FEEDBACK_KEY` is set, with a
  `data-section` on every block.
- [`examples/react-vite`](https://github.com/danielrose7/preview-feedback/tree/main/examples/react-vite):
  a React 19 + Vite app that installs the widget from GitHub and mounts it from `useEffect`.

## How pins anchor

Comments pin to the nearest ancestor that is a direct child of `<main>` and has a `data-section`
attribute (the section's name), plus a path and a text snippet inside it. Without `data-section`
attributes it still works, using a path from `<body>`; sections just give steadier, more readable
anchors ("the faq section").

Each comment also records the page, the viewport size and scroll position, the build, and the user
agent, so a phone-only problem is recognisable as one.

## Deep links

A preview URL with `?fb=<thread id>` opens that thread and scrolls to its pin. The CLI and dashboard
build these for you when a site has a preview URL.

## Not on published sites

Add the element only to private previews. It does nothing useful on a live site.
