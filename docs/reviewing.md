---
title: Reviewing feedback
description: The self-hosted dashboard at /studio/ and the admin CLI
---

# Reviewing feedback

Two ways, both talking to the same admin API with the same **admin token**.

## The dashboard

Open `https://YOUR-WORKER/studio/` and paste the admin token (the `ADMIN_TOKEN` secret). It is static
files served by the same Worker, so there is nothing else to host.

- Every site's threads in one place; filter by page, width and status.
- Reply, resolve with a note, reopen.
- **Open on preview** lands on the exact pin, when the site has a preview URL.
- The token stays in `sessionStorage`, or `localStorage` if you tick "Remember on this device". Sign out
  clears both. The page sends a strict Content-Security-Policy and `noindex`, and renders comments as
  text only.

Sites registered before the registry existed do not appear until you re-run
`pnpm feedback preview-url <slug> ""` on them.

## The CLI

```sh
export FEEDBACK_ENDPOINT=https://YOUR-WORKER
export FEEDBACK_ADMIN_TOKEN=…
export FEEDBACK_PREVIEW_URL=https://the-preview     # optional, adds a deep link per thread

pnpm feedback sites                         # registered sites with open and resolved counts
pnpm feedback register <slug> [--preview-url URL]
pnpm feedback preview-url <slug> <URL|"">
pnpm feedback pull <slug> [--open] [--out file]
pnpm feedback reply <slug> <id> <text> [--as Name]
pnpm feedback resolve <slug> <id> [note]
pnpm feedback reopen <slug> <id>
pnpm feedback delete <slug> <id>
```

`pull` writes the full export to `.work/feedback/<slug>.json` and prints a summary grouped by page,
with each thread's anchor, state, replies and deep link. Replies from the CLI default to the author
"Daniel"; use `--as` to change it.
