# preview-feedback

Honor-system feedback for private website previews. A reviewer opens a preview link, drops a pin on
the page, and writes a comment. No account, no browser extension. Think of the Vercel toolbar's
comments, but for any host, with nothing to install and no login: the unguessable link is the access
control.

- **On the page:** numbered pins, threads with replies, resolve and reopen, an inbox across pages, and
  a toolbar you can drag anywhere (and fold into a bubble).
- **A web component:** `<preview-feedback>`, one script tag, shadow DOM so the host page's CSS cannot
  touch it. About 19 KB gzipped (Lit included).
- **A small API:** one Cloudflare Worker, one SQLite Durable Object per site. Free-plan friendly.
- **A dashboard you host yourself:** every site's threads in one place at `/studio/` on the same Worker.
  Filter by page and width, reply, resolve with a note, open the preview on the exact pin.
- **A CLI for you and your agents:** pull, reply, resolve and reopen from the terminal.
- **Docs for people and agents:** served at `/docs/` on the same Worker, with `llms.txt`,
  `llms-full.txt` and a markdown twin of every page.

## Using it

1. Register a site: `pnpm feedback register my-site` prints its **site key** once.
2. Put the snippet below on a private preview, with the preview's origin in the Worker's allowlist.
3. Reviewers open the preview link, press **Comment**, click where the problem is, and type. They are
   asked for a name once. They can reply, resolve and reopen, and browse an inbox across pages.
4. You read the threads in the dashboard at `/studio/` or with `pnpm feedback pull my-site --open`, change
   the site, then reply and resolve. An agent can do the same loop.

## Embed it

```html
<script src="https://YOUR-WORKER/v1/widget.js" defer></script>
<preview-feedback
  endpoint="https://YOUR-WORKER"
  slug="my-site"
  site-key="…"
  pages="/,/about/,/contact/"></preview-feedback>
```

From a bundler, load the script and call `window.PreviewFeedback.mount({ endpoint, slug, siteKey })`.
The widget is not published to npm yet; [docs/packaging.md](docs/packaging.md) says what that would take.
More in [docs/embedding.md](docs/embedding.md).

## Run it locally

```sh
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm dev                                   # builds the widget, serves the API on :8787
FEEDBACK_ADMIN_TOKEN=dev-admin pnpm feedback register my-site   # prints the site key
```

Then put the snippet above on a page served from `localhost` (the default allowlist) with
`endpoint="http://localhost:8787"`.

## Try it on the demo site

Live: https://preview-feedback-acme-demo.danielrose7.workers.dev (leave a pin; comments land in the
`acme-demo` site on the live Worker). To run it yourself:

`apps/demo` is a small Astro site for a fake company, Acme Anvils, with four pages and `data-section`
blocks so pins anchor readably. It carries the widget only when `FEEDBACK_KEY` is set:

```sh
FEEDBACK_ADMIN_TOKEN=dev-admin pnpm feedback register acme-demo     # prints the site key
FEEDBACK_KEY=… FEEDBACK_ENDPOINT=http://localhost:8787 pnpm --filter @preview-feedback/demo build
pnpm --filter @preview-feedback/demo preview                        # http://localhost:4321
```

A build without `FEEDBACK_KEY` has no element and no script. `FEEDBACK_SLUG` overrides the slug
(`acme-demo`), and `BUILD_ID` stamps each comment with a build. `apps/demo/wrangler.jsonc` deploys the
built site as a Worker with static assets; its origin must be in the feedback Worker's `ALLOWED_ORIGINS`.

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

## Docs

Markdown sources are in `docs/`; `apps/docs` renders them to `/docs/` on the Worker (Copy as Markdown,
View as Markdown, `/llms.txt`, `/llms-full.txt`, a sitemap, and `/agent-setup/prompt.md` for agents).

| Page | Covers |
| --- | --- |
| [Getting started](docs/getting-started.md) | Register, allow the origin, embed, leave a pin |
| [Embedding](docs/embedding.md) | Attributes, bundler API, how pins anchor, deep links |
| [Packaging](docs/packaging.md) | Why there is no npm package yet, and the package.json setup to publish one |
| [Reviewing feedback](docs/reviewing.md) | The dashboard and every CLI command |
| [Agents](docs/agents.md) | The pull, change, reply, resolve loop, and treating comments as data |
| [HTTP API](docs/api.md) | Browser and admin routes, limits, errors |
| [Self-hosting](docs/self-host.md) | Deploy to Cloudflare, secrets, rotating keys |
| [Security model](docs/security.md) | The link is the credential; what that does and does not mean |
| [Tenancy](docs/tenancy.md), [Roadmap](docs/roadmap.md) | Where it is going |

## Layout

```
packages/widget   the <preview-feedback> element, its pure logic, unit tests, and the browser check
apps/dashboard    the self-hosted dashboard (Lit), built into the Worker's static assets at /studio/
apps/demo         a small Astro site (Acme Anvils) for trying the widget
apps/docs         renders docs/*.md into the Worker's static assets at /docs/, plus llms.txt
apps/api          the Worker + Durable Object, the admin CLI, and the built widget it serves at /v1/widget.js
docs/             the documentation sources, the tenancy design, and the plan this repo started from
```

## Test

```sh
pnpm typecheck && pnpm test     # 68 widget tests, 53 API tests, 4 docs tests, 25 demo checks
pnpm e2e                        # 122 widget + 46 dashboard + 36 docs checks in real Chrome against a real Worker
```

The browser check needs Google Chrome installed (it drives the system browser through Playwright).

## Status

Deployed at https://preview-feedback.danielrose7.workers.dev (docs at `/docs/`, dashboard at `/studio/`).
Not yet tried on a phone or by a second site; see [docs/roadmap.md](docs/roadmap.md). Started inside
`goji-sites` (see [docs/origin-plan.md](docs/origin-plan.md) for the build history and decisions).
