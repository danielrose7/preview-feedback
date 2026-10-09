# Embedding the widget

## What you need

1. A running API (`apps/api`), with its address: the **endpoint**.
2. A **slug** for the site (lowercase letters, digits, hyphens) and its **site key**, from
   `pnpm feedback register <slug>`. The key is shown once; registering again rotates it and revokes the
   old one.
3. The page's origin in the API's `ALLOWED_ORIGINS` (localhost is allowed by default).

## Script tag (any site, any framework)

```html
<script src="https://YOUR-WORKER/v1/widget.js" defer></script>
<preview-feedback endpoint="https://YOUR-WORKER" slug="my-site" site-key="…"></preview-feedback>
```

The script is a classic IIFE, so it loads cross-origin without CORS headers. It registers the
`<preview-feedback>` element and a `PreviewFeedback` global (`mount`, `define`).

## Attributes

| Attribute | Required | Meaning |
| --- | --- | --- |
| `endpoint` | yes | The API origin, no trailing slash needed. |
| `slug` | yes | The site's slug. |
| `site-key` | yes | The key from `register`. Anyone holding the preview can read it; that is the model. |
| `build` | no | A build id stored with each comment, so you know which version was reviewed. |
| `pages` | no | The site's nav hrefs, comma separated or a JSON array, so the inbox lists pages in that order. |

Changing an attribute remounts the widget. Properties set through `element.config = { … }` win over
attributes. A second `<preview-feedback>` on a page is ignored with a console warning.

## From a bundler

```ts
import "@preview-feedback/widget";            // registers the element
// or
import { mount } from "@preview-feedback/widget";
const undo = mount({ endpoint, slug, siteKey }); // returns a function that removes it
```

## Telling the widget where things are

Comments pin to the nearest ancestor that is a direct child of `<main>` and has a `data-section`
attribute (the section's name), plus a path and a text snippet inside it. Without `data-section`
attributes it still works, using a path from `<body>`; sections just give steadier, more readable
anchors ("the faq section").

## Not on published sites

Add the element only to private previews. It does nothing useful on a live site, and the site key in
the markup is meant for people who already hold the preview link.
