# Roadmap

What exists is described in `README.md`. This is what we do next and the ideas behind it, in order.

## Done

- The widget as a real web component, `<preview-feedback>`, with a lifecycle that cleans up after
  itself, served by the Worker as one script and also importable.
- Pins, threads, replies, resolve and reopen, author-only delete, an inbox across pages, deep links,
  scroll-to-pin, and a toolbar that drags anywhere, folds to a bubble and stands up at side edges.
- The Worker with a Durable Object per site, the admin CLI, and 235 automated checks.

## Next

1. **Cut goji-sites over.** `Feedback.astro` emits the element and a script tag pointing at the Worker.
   Delete the copies of the widget and API from goji-sites.
2. **Deploy** to workers.dev with a real admin token and the allowed-origin list, then try it on a phone.
3. **Lit, in steps.** Convert the toolbar, then the inbox rows and thread view, then compose, then the
   root element, keeping `mount()` and `<preview-feedback>` as they are. Done when the 122 browser checks
   pass unchanged. Reasons: the hand-written render-and-restore-focus code caused real bugs, and Lit
   gives lifecycle and composition for about 5 KB. (TypeScript needs `useDefineForClassFields: false`.)
4. **Tenancy**, per `docs/tenancy.md`: workspaces, per-site allowed origins, scoped tokens. Before a
   second agency.

## Then

- **Studio-style dashboard.** All sites and threads in one place: filters (open, resolved, page, width),
  an Open on preview link that lands on the exact pin, reply and resolve with a note. Reads the same API.
  Open question: a standalone app in this repo, or a page in the goji-sites studio.
- **API v1 for the dashboard and agents.** A versioned OpenAPI file; `--json` and `--since <id>` on every
  CLI command; a versioned export schema; machine-readable errors; scoped agent tokens; every comment
  body marked as untrusted data in agent-facing output. `llms.txt`, markdown copies of the docs, and an
  `apply-feedback` skill so an agent can work the loop: pull open threads, change the site, reply with
  what changed and a commit link, resolve.
- **Live updates** over a WebSocket to the site object (hibernation, as story-points does) instead of the
  30-second poll, so a resolve disappears for everyone at once.

## Ideas, unordered

- Source hints: an optional `data-src` on a section is stored with the pin, so an agent knows which file
  to edit.
- An "addressed, awaiting confirmation" state between open and resolved.
- Screenshot or viewport replay with each comment.
- Notifications: email or Slack when a comment lands; a digest.
- A remote MCP server on the Worker, for agents with no shell.
- Webhooks, and a `watch` command that streams new comments as JSON lines.
- Editing a comment, dragging a pin, keyboard placement of a pin.
- Theming through CSS custom properties; a translations layer.
- Claim a thread ("working on it") so two agents do not duplicate effort.
- Export and import between sites and workspaces; retention settings.
