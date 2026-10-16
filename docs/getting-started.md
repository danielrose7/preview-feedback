---
title: Getting started
description: Register a site, embed the widget in a private preview, and leave your first pin
---

# Getting started

You need a deployed Worker (see [Self-hosting](/docs/self-host)) or the local one from `pnpm dev`, plus
its **admin token**.

## 1. Register a site

A site is one preview project. Its slug is lowercase letters, digits and hyphens.

```sh
export FEEDBACK_ENDPOINT=https://YOUR-WORKER
export FEEDBACK_ADMIN_TOKEN=…
pnpm feedback register my-site --preview-url https://my-site.preview.example.com
```

The command prints the **site key** once. Registering the same slug again rotates the key and revokes
the old one. `--preview-url` is optional; it lets the dashboard and CLI link straight to a pin.

## 2. Allow the preview's origin

The Worker only answers browsers from origins in its `ALLOWED_ORIGINS` variable (localhost is allowed
by default). Add your preview's origin, for example `https://*.preview.example.com`, and redeploy.
`*` matches any run of characters except `/`, dots included, so `https://*.pages.dev` also matches `https://a.b.pages.dev`; start the pattern with the dot (`*.example.com`, not `*example.com`) so `evilexample.com` does not match.

## 3. Embed it

```html
<script src="https://YOUR-WORKER/v1/widget.js" defer></script>
<preview-feedback
  endpoint="https://YOUR-WORKER"
  slug="my-site"
  site-key="…"
  pages="/,/about/,/contact/"></preview-feedback>
```

Put this on **private previews only**. The site key is in the markup, which is fine for people who
already hold the preview link and wrong for a public site.

## 4. Leave a pin

Open the preview. A toolbar appears; drag it anywhere, or fold it into a bubble. Press **Comment**,
click anywhere on the page to drop a pin, type, and send. Your name is asked once and remembered in your
browser.

## 5. Read it

```sh
pnpm feedback pull my-site --open
```

or open `/studio/` on the Worker and paste the admin token. See [Reviewing feedback](/docs/reviewing).
