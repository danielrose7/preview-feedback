# preview-feedback

Honor-system feedback for private website previews. A reviewer opens a preview link, drops a pin on
the page, and writes a comment. No account, no browser extension. Think of the Vercel toolbar's
comments, but for any host, with nothing to install and no login: the unguessable link is the access
control.

- **On the page:** numbered pins, threads with replies, resolve and reopen, an inbox across pages, and
  a toolbar you can drag anywhere (and fold into a bubble).
- **A web component:** `<preview-feedback>`, one script tag, shadow DOM so the host page's CSS cannot
  touch it. About 13 KB gzipped, no framework.
- **A small API:** one Cloudflare Worker, one SQLite Durable Object per site. Free-plan friendly.
- **A dashboard you host yourself:** every site's threads in one place at `/studio/` on the same Worker.
  Filter by page and width, reply, resolve with a note, open the preview on the exact pin.
- **A CLI for you and your agents:** pull, reply, resolve and reopen from the terminal.

## Embed it

```html
<script src="https://YOUR-WORKER/v1/widget.js" defer></script>
<preview-feedback
  endpoint="https://YOUR-WORKER"
  slug="my-site"
  site-key="…"
  pages="/,/about/,/contact/"></preview-feedback>
```

From a bundler instead: `import "@preview-feedback/widget"` registers the element, or
`import { mount } from "@preview-feedback/widget"` and call `mount({ endpoint, slug, siteKey })`. More
in [docs/embedding.md](docs/embedding.md).

## Run it locally

```sh
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm dev                                   # builds the widget, serves the API on :8787
FEEDBACK_ADMIN_TOKEN=dev-admin pnpm feedback register my-site   # prints the site key
```

Then put the snippet above on a page served from `localhost` (the default allowlist) with
`endpoint="http://localhost:8787"`.

## Review the feedback

```sh
export FEEDBACK_ADMIN_TOKEN=…  FEEDBACK_ENDPOINT=…  FEEDBACK_PREVIEW_URL=https://the-preview
pnpm feedback pull my-site --open          # open threads, with a deep link to each pin
pnpm feedback reply my-site 12 "Done in build 3"
pnpm feedback resolve my-site 12 "Headline reworded"
```

## The dashboard

`pnpm dev`, then open http://localhost:8787/studio/ and paste the admin token (`ADMIN_TOKEN`, from
`apps/api/.dev.vars` locally; the Worker secret when deployed). It is static files served by the same
Worker, so there is nothing else to host, and it calls only that Worker's `/admin` API.

- Register a site with its preview URL so "Open on preview" lands on the pin:
  `pnpm feedback register my-site --preview-url https://my-site.preview.example.com`
  (or `pnpm feedback preview-url my-site <URL>` later, or the link at the bottom of the dashboard).
- The token stays in `sessionStorage`, or `localStorage` if you tick "Remember on this device".
  Sign out clears both. The page sends a strict CSP and `noindex`, and renders comments as text only.
- `/admin/sites` lists only sites registered after the registry existed. Re-run
  `pnpm feedback preview-url <slug> ""` on an older site to add it without rotating its key.

## Layout

```
packages/widget   the <preview-feedback> element, its pure logic, unit tests, and the browser check
apps/dashboard    the self-hosted dashboard (Lit), built into the Worker's static assets at /studio/
apps/api          the Worker + Durable Object, the admin CLI, and the built widget it serves at /v1/widget.js
docs/             embedding, roadmap, tenancy design, and the plan this repo started from
```

## Test

```sh
pnpm typecheck && pnpm test     # 68 widget tests, 49 API tests
pnpm e2e                        # 122 widget + 46 dashboard checks in real Chrome against a real Worker
```

The browser check needs Google Chrome installed (it drives the system browser through Playwright).

## Status

Local only. Not deployed yet; see [docs/roadmap.md](docs/roadmap.md). Started inside
`goji-sites` (see [docs/origin-plan.md](docs/origin-plan.md) for the build history and decisions).
