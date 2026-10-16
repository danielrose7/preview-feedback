---
title: Self-hosting
description: Deploy your own Worker to Cloudflare, set the admin token and allowed origins
---

# Self-hosting

One Cloudflare Worker with two Durable Object classes and static assets. The free plan is enough.

## Deploy

```sh
git clone https://github.com/danielrose7/preview-feedback
cd preview-feedback
pnpm install
pnpm build                                   # builds the widget, dashboard and docs
cd apps/api
pnpm exec wrangler login
pnpm exec wrangler secret put ADMIN_TOKEN    # a long random string
```

Edit `ALLOWED_ORIGINS` in `apps/api/wrangler.jsonc` to your preview origins, comma separated.
`*` matches any run of characters except `/`, dots included, so `https://*.pages.dev` also matches
`https://a.b.pages.dev`. Start a pattern with the dot (`*.example.com`, not `*example.com`) so
`evilexample.com` does not match. Then:

```sh
pnpm run deploy
```

Wrangler prints the Worker's address. That is your **endpoint**; the widget is at `/v1/widget.js`, the
dashboard at `/studio/`, and these docs at `/docs/`.

## First site

```sh
export FEEDBACK_ENDPOINT=https://YOUR-WORKER
export FEEDBACK_ADMIN_TOKEN=…
pnpm feedback register my-site --preview-url https://my-site.preview.example.com
```

Then follow [Getting started](/docs/getting-started) from step 3.

## Local development

```sh
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm dev                                      # API, widget, dashboard and docs on :8787
```

## Checks

```sh
pnpm typecheck && pnpm test
pnpm e2e        # real Chrome against a real Worker; needs Google Chrome installed
```

## Rotating things

- **Site key:** `pnpm feedback register <slug>` again. The old key stops working.
- **Admin token:** `wrangler secret put ADMIN_TOKEN` with a new value.
