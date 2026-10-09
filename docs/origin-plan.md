# Preview feedback capture plan

Drafted 2026-10-09. Phases 1 to 4 are built and verified locally on 2026-10-09 (prototype working);
phase 5 (deploy) is not done.

## Status

- Phase 1 `apps/feedback` (package `@goji-sites/feedback-api`): done, 14 Worker tests, curl round trip
  and persistence across a `wrangler dev` restart checked.
- Phase 2 `packages/feedback` (package `@goji-sites/feedback`): done, 14 anchor tests.
- Phase 3 base 0.14.0: done. Sections get `data-section` (the id, or `type-n` when a section has no
  id, so anchors never depend on authors adding ids). Build with `FEEDBACK_OFF=1` to drop the widget
  for screenshots, like `GATE_OFF`. molly-gibson reads `FEEDBACK_KEY` / `FEEDBACK_ENDPOINT` at build time.
- Phase 4 `pnpm feedback register|pull|delete <slug>`: done (needs `FEEDBACK_ADMIN_TOKEN`).
- Browser-checked with Playwright on Chrome at 1280 and 390 px: open, point at an element, send,
  reload and see it again, reveal an anchor, Escape/Cancel, validation, hidden while `html.gated`.
- Phase 7 (pins and toolbar, Vercel-style): built; see its section. The old floating button and the
  "Point at something" step are gone.
- Phase 6 (threads, resolve/reopen, author-only delete, inbox, cross-page reveal, deep links, icon
  actions, CLI `reply|resolve|reopen|pull --open`): built. 40 API tests (including the 1000-comment cap
  and an in-place migration of a first-release database), 24 widget tests, and a committed browser
  check, `pnpm --filter @goji-sites/feedback e2e` (41 checks: its own API on port 8799, a three-page
  fixture on 8798, real Chrome at 1280 and 390 px; screenshots in `.work/fb/e2e/`).
- Not done: Post pages have no section wrappers so comments there anchor by
  body-relative path only.

## Why

After Daniel sends a practice its preview, the feedback arrives by email, text or a call, with no
link to the part of the page it was about. Goal: an on-page widget the practice owner can use with no
extension and no account, whose comments land in a store Daniel can read.

Scope today is **capture only**. Replying, resolving, approving, screenshots, uploads, notifications,
named variants and an `apply-feedback` skill are out of scope (see "Later").

Hosting the previews themselves on a domain Daniel controls is a separate plan. This one must work
before that exists (widget on any origin, API on its own origin) and slot into it afterwards.

## Decisions

1. **Storage: Cloudflare Durable Object with SQLite storage, one object per site**
   (`env.FEEDBACK.idFromName(slug)`). A site's comments are small, written rarely and read together, so
   one SQL-backed object per site is simpler than D1 and gives serialised writes for free (ordering,
   rate limiting and id assignment need no coordination). `wrangler dev` runs the same code locally
   with local SQLite, so there is no separate "local-only" version to throw away.
2. **A standalone Worker, `apps/feedback`**, with CORS limited to an allowlist of preview origins.
   When `apps/router` exists it can mount the same handler under `/__fb/` on each preview origin; the
   widget takes its endpoint from config so nothing else changes.
3. **No accounts.** The unguessable preview URL is the access control, as in CLAUDE.md. Two secrets:
   - a per-site **site key** in the page's config (public to anyone holding the preview). It lets the
     holder post and list comments for that site only.
   - one **admin token** (Worker secret, never in a site) for `pnpm feedback pull` and deletes.
4. **Widget is vanilla TS in Shadow DOM**, in `packages/feedback`, rendered by `base` only when
   `site.feedback` is set. A live build leaves `site.feedback` out, so nothing ships.
5. **Anchors**: `base` already wraps every section in `<div id={s.id}>`. A comment records the nearest
   ancestor id, so most comments say "the FAQ section" with no extra markup. Header, footer and
   anything outside a section fall back to a tag path.
6. **Commenters are practice owners reviewing their own website**, not patients, so the compose box
   carries no health-information warning. Comments are still free text: the store is separate from
   site hosting, and nothing reaches the sites repo
   except through an explicit `pull`.

## Data model

One row per comment, in the site's Durable Object:

| Field | Notes |
| --- | --- |
| `id` | integer, assigned by the object |
| `created_at` | ISO timestamp (server) |
| `author` | name the visitor typed, 1 to 80 chars |
| `body` | 1 to 2000 chars |
| `page` | path, e.g. `/services/` |
| `anchor_id` | nearest ancestor `id` (section id), or null |
| `anchor_path` | short tag/nth-child path to the clicked element, or null for a general comment |
| `anchor_text` | up to 120 chars of the clicked element's text, for re-finding it after a rebuild |
| `viewport_w`, `viewport_h` | window size when written; the breakpoint is derived |
| `scroll_y` | scroll position |
| `build` | build id baked into the page, so we know which version they saw |
| `user_agent` | truncated to 200 chars |

General comments have null anchors. No IP is stored; rate limiting uses a hash of IP plus day, kept
only in memory in the object.

## API

All under the Worker origin. Every request carries `x-site-key`; the object for the path's slug checks it.

- `POST /sites/:slug/comments` creates a comment. Returns the stored row. 400 on bad fields.
- `GET  /sites/:slug/comments?page=/services/` lists comments (all pages if omitted), oldest first.
- `GET  /admin/sites/:slug/export` (bearer admin token) returns everything as JSON.
- `DELETE /admin/sites/:slug/comments/:id` (admin token).
- Limits: 8 KB body, 20 posts per rate-limit key per hour, 1000 comments per site (then 429).
- First write to a slug registers its site key (trust on first use), or `pnpm feedback register
  <slug>` sets it explicitly; see open question 2.

## Widget behaviour

- Floating "Leave feedback" button, bottom right, large enough for a thumb. It does not appear while
  the passphrase `Gate` is up, and appears when the gate unlocks.
- Name is asked once and kept in localStorage. All reads and writes of storage are wrapped in
  try/catch; the widget works without it.
- Two actions: "Comment on this page" (general) and "Point at something" (a crosshair mode where a tap
  or click selects an element, with a highlight, then opens the compose box). Escape or a second tap
  cancels. On touch devices the page is not scrolled-locked in pointing mode.
- Compose box: textarea, Send. On success it shows in the list immediately.
  On failure the draft is kept and a retry is offered.
- List: this page's comments, with the author and a short "on the FAQ section" label. Clicking one
  scrolls to its anchor and highlights it if it is still found. Count badge on the button.
- Phone: the panel is a bottom sheet. Desktop: a right-hand panel that does not cover the page.
- Styling is isolated in Shadow DOM and does not read the site's theme tokens, so a bad brand colour
  cannot make it unreadable.
- Nothing is sent until the visitor presses Send.

## Phases

### Phase 1: Worker and Durable Object (`apps/feedback`)

Deliverable: `wrangler.jsonc` with a SQLite-backed `FeedbackSite` class, the routes above, validation,
CORS allowlist, rate limiting, and `vitest` tests using the Workers pool.

Exit: tests cover create, list by page, bad input, wrong key, wrong slug, rate limit, cap, admin export
and delete. `pnpm --filter @goji-sites/feedback-api dev` serves it locally and `curl` round-trips a comment.

### Phase 2: widget (`packages/feedback`)

Deliverable: the widget as a single module with a small `mount({ endpoint, slug, siteKey, build })`.
Includes the anchor resolver (`anchorFor(el)` and `findAnchor(row)`) with unit tests.

Exit: against the local Worker, a comment can be added as general and as pinned, appears in the list
after a reload, and survives the Worker restarting. Pointing at a section, a header link and an
element inside a FAQ accordion each store a sensible `anchor_id` / `anchor_path`.

### Phase 3: wire into `base`

Deliverable: `site.feedback?: { endpoint: string; siteKey: string }` in `types.ts`, a
`components/Feedback.astro` rendered by the Page, Post and Stack layouts, a build id from
`process.env.BUILD_ID` (falling back to a timestamp), and a bump to base 0.14.0. molly-gibson pins it.

Exit: molly-gibson built with feedback config shows the widget; built without it, no page references
the widget and no key or config is present. Known limit: Astro still emits the widget chunk as an
unreferenced file in `_astro/` (a dynamic import did not avoid it); it holds no secrets. `pnpm shots compare` still matches, widget closed, at three widths.

### Phase 4: reading it back

Deliverable: `pnpm feedback pull <slug>` writes `.work/feedback/<slug>.json` (git-ignored) and
prints a short summary grouped by page and section. Admin token and endpoint come from env vars, never
from a committed file.

Exit: pull after phase 3's test comments produces the file and a readable summary.

### Phase 5: deploy

Deliverable: `wrangler deploy` to Daniel's Cloudflare account on a workers.dev or custom hostname,
admin token set as a secret, CORS allowlist set to the preview origins in use. Update CLAUDE.md, which
currently says nothing is deployed and no Cloudflare credentials are needed.

Exit: a preview opened on a phone, on a different origin from the Worker, can post a comment that
`pnpm feedback pull` then retrieves.

## Phase 6: threads, resolve, delete, inbox (decided and built 2026-10-09)

Decisions made with Daniel:

- **Threads.** A thread is a root comment plus flat, chronological replies, one level deep. Replies
  inherit the root's page and anchor.
- **Resolve is thread-level**, never per message. Anyone with the preview link can resolve or reopen.
  The widget records who did it and when; the resolver may add a short note.
- **Reopen, then reply.** A resolved thread is read-only: its reply box is replaced by Reopen, and a
  reply never reopens a thread by itself.
- **Delete is hard**, and allowed only when every message in the thread has the requester's name. A
  reply under any other name (Daniel's included) locks the thread. Daniel can still hard-delete
  anything from the CLI.
- **"Same author" means same name**, compared trimmed and case-insensitive. This is spoofable by
  design: the audience is a few people sharing a private link. No token, no accounts.
- **Name lives in device settings** (localStorage): "Posting as Molly · change". It leaves the compose box.
- **Inbox is a tab** in the panel (This page | All), with Open / Resolved filters. Open is the default;
  the badge counts open threads only. Thread detail opens inside the panel with a back arrow, as a
  bottom sheet on phones.

Defaults taken for the small items (change any of them):

- Each comment stores `page_title`, so the inbox says "Services", not `/services/`.
- Clicking a thread on another page records "reveal thread N" in `sessionStorage` and navigates; the
  new page opens the panel and reveals the anchor. `?fb=N` does the same when storage is blocked, and
  is the deep link Daniel can share. If the anchor is gone the thread still opens, marked "this spot
  has changed".
- Panel open/closed, tab and filter persist across page loads in `sessionStorage`.
- "Mine" filter and "new since last visit" are not in this phase.
- CLI deep links use `FEEDBACK_PREVIEW_URL` (one origin) when set; otherwise `pull` prints paths only.

Data model changes (existing Durable Objects migrate in place with guarded `ALTER TABLE`):

| Column | Notes |
| --- | --- |
| `parent_id` | null for a root, else the root's id. Replies to replies are rejected. |
| `author_key` | lowercased, trimmed author, for the delete rule |
| `page_title` | up to 120 chars |
| `status` | on roots only: `open` or `resolved` |
| `resolved_at`, `resolved_by`, `resolution_note` | on roots; `resolved_by` is the typed name or `admin` |
| `reopened_at`, `reopened_by` | last reopen, for the history line |

API (all browser routes carry `x-site-key`):

- `POST /sites/:slug/comments` takes an optional `parent_id`. A reply to a resolved or missing root is
  409 / 404. Replies count toward the rate limit and the 1000 cap.
- `POST /sites/:slug/threads/:id/resolve` with `{ by, note? }` and `/reopen` with `{ by }`.
- `DELETE /sites/:slug/threads/:id` with `x-author: <name>`. 403 unless every message in the thread
  has that name. Deletes the root and all replies.
- `GET /sites/:slug/comments` returns the flat list including the new fields; the widget groups it.
- Admin: reply, resolve with a note, delete any thread, export with the new fields.

Sub-phases, each with an exit check (all met):

- **6a API and migration.** Exit: tests for reply, reply to resolved (409), reply to a reply (400),
  resolve and reopen with recorded names, delete allowed for a single-author thread, delete refused
  after someone else replied, name matching ignores case and spaces, admin delete any, and an existing
  database with the old columns migrates and keeps its comments.
- **6b Widget threads.** Name settings row, thread view, replies, resolve/reopen, delete. Exit:
  Playwright at 1280 and 390 px covers each, including the read-only resolved state and the locked delete.
- **6c Inbox and navigation.** This page | All tabs, Open / Resolved filters, grouped by page, reveal
  across pages, `?fb=N`, persisted panel state. Exit: Playwright follows a thread on `/` to a comment on
  another page and lands on its highlighted anchor; a missing anchor shows "this spot has changed".
- **6d CLI.** `pnpm feedback reply|resolve|reopen <slug> <id> ...`, `pull --open`, deep links. Exit: a
  reply and resolve from the CLI show up in the widget.

Added during the build: icon actions (show on page, resolve or reopen, delete) at the top of each
thread and on each inbox row; the panel refreshes when moving between list and thread, so another
person's reply appears without reopening it; typed text in the name, reply, note and compose boxes
survives those refreshes.

Out of scope here: notifications, editing a comment, reactions, per-device identity.

## Phase 7: pins and toolbar, Vercel-style (decided and built 2026-10-09)

Chosen from the UI directions artifact (board C). Same data, threads, resolve/delete rules, inbox and
deep links as phase 6; a new presentation.

Decisions made with Daniel (all taken as recommended):

- **Click-anywhere comment mode** replaces "Point at something". The toolbar's Comment button turns
  the page into a place-a-pin surface; a click drops a pending pin and opens the compose popover there.
- **Resolved threads have no pin** (changed later the same day: it was first "hidden unless the Resolved filter is on, then faded"). A resolved thread stays in the inbox, its popover still opens beside the spot it was about, but nothing is drawn on the page and its inbox row carries no pin number. Open pages also refresh every 30 seconds while visible, so a resolve done elsewhere removes the pin here.
- **Page comments** (no spot, no pin) come from a "Page comment" button in the inbox, and live only in
  the inbox.
- **Phone keeps the bottom sheet** for the inbox, thread and compose, with the toolbar and pins still
  shown. On desktop the same panel is a popover: anchored to its pin for a thread or new comment,
  above the toolbar for the inbox.

Design:

- **Toolbar pill**, bottom centre: Comment | Inbox (open count) | Open/Resolved filter | hide. Labels
  collapse to icons under 480 px. It replaces the old Feedback button.
- **Pins** are fixed-position buttons recomputed from each anchor's rectangle on scroll, resize, load
  and layout changes, so pins on fixed or sticky elements stay put. Numbered per page in the shown
  set; open dark, selected blue, pending blue with a plus. A pin that lands within 20 px of an earlier
  one is nudged sideways.
- **Pin position** is the anchor element plus where inside it the click landed, as fractions
  `anchor_dx`, `anchor_dy` (0 to 1). Existing comments have none and pin to the element's top-left.
- **Not drawable** cases are named, never silent: an anchor that no longer exists says "this spot has
  changed"; one that exists but has no box at this width says "not visible at this width". Both still
  appear in the inbox.
- **Replies inherit** the root's pin position like they inherit its page and anchor.
- **Opening a thread scrolls its pin into view** (same page: an inbox row, "Show on page", or landing
  from a deep link or another page). Only when the pin is outside a comfortable band (90px from the top,
  140px from the bottom, clear of the toolbar); then it is centred. A pin already in the band never
  moves the page, so clicking a visible pin does not jump. The popover follows the pin as it scrolls,
  and the element is outlined once the scroll settles. Honours reduced-motion.

Sub-phases, each with an exit check (all met):

- **7a API and migration.** `anchor_dx`, `anchor_dy` added in place (REAL, null allowed), validated
  to 0..1 and rounded, returned on every comment, inherited by replies. Exit: API tests for store,
  clip, null for general comments, reply inheritance, and migration of an old database.
- **7b Layout helpers.** Pure, tested functions: pin point from a rectangle and fractions, nudging
  overlapping pins, popover placement with viewport flip and clamp, pin numbering.
- **7c Widget.** Toolbar, pins layer, comment mode, popover placement for the existing panel views,
  page comment, filter shortcut, named not-drawable states. Exit: type check and unit tests.
- **7d Browser check.** The e2e is rewritten for the new controls and adds: pins appear at the clicked
  spot, number and select, resolved pins hide and fade, a fixed header pin stays put on scroll,
  overlapping pins separate, a pin hidden at phone width is named in the inbox, popover stays inside
  the viewport, and phone shows the sheet.

Built result: 45 API tests, 44 widget tests (layout, anchors, threads, session, pin edge rule), and the browser check
now has 69 checks, including a pin landing on the clicked spot, a pin on a fixed header staying put
through a scroll, overlapping pins separating, a popover near the right edge staying on screen, and a
desktop-only spot named on a phone. Two real bugs came out of it: row notes such as "not visible at
this width" were computed one frame after the list rendered, and pins near the top edge of the screen
were clipped (the first fix made them stick to the screen edge instead of scrolling away; the browser check caught it, and the rule is now a tested function). Old comments (no `anchor_dx`/`anchor_dy`) pin to their element's top-left corner.

Out of scope: dragging a pin, editing a comment, keyboard placement of a pin (pins themselves are
buttons and reachable by Tab; placing one needs the pointer for now).

## Phase 8: movable toolbar (decided and built 2026-10-09)

The toolbar can be dragged anywhere in the viewport and collapsed to a bubble, like the Next.js
indicator and the Vercel toolbar bubble.

- **Free placement**, not corner snapping (Daniel's call). A grip handle on the pill and the whole
  bubble are drag handles; a 4px threshold separates a drag from a click, and the click that follows
  a drag is swallowed so it cannot expand or toggle anything.
- **Position is stored as fractions** of the toolbar's travel (the viewport minus a 16px margin), so
  a resize keeps it in proportion and it can never leave the screen. Remembered per device in
  localStorage, with the collapsed state. Default: bottom centre, expanded.
- **Collapse keeps the centre.** The bubble (48px, comment icon, open-count badge) appears where the
  pill's centre was; expanding grows back around the same centre, clamped to the margin.
- **Popovers follow it.** In the lower half of the screen the inbox opens above the toolbar and
  centred on it; in the upper half, below it. Pinned popovers stay clear of it on either side.
- **Keyboard.** Arrow keys on the focused grip or bubble move it 24px (96 with Shift).
- **Orientation.** Decided on drop (and after an arrow-key move), never mid-drag. Within 48px of a
  left or right edge it stands up; within 48px of the top or bottom it lies down; anywhere else it
  keeps what it was, so dragging a vertical toolbar inward does not flip it back. In a corner the
  nearer edge wins, a tie going to the side. Turning keeps the edge it was against. Vertical is
  icon-only (the filter becomes a circle or ticked circle, the count a badge on the inbox icon) and
  popovers open to its inboard side instead of above or below. Remembered with the position; the bubble
  has no orientation, only the choice is kept for when it expands.
- **Touch.** The handles set `touch-action: none` so a drag does not scroll the page. Not covered by
  an automated drag test (Playwright's touchscreen has no drag); the pointer-event path is the same.

Built result: 65 widget tests (placement maths, round-trips, resize, per-side popover placement, stored
state, orientation rules) and 98 browser checks. A popover used to be placed one frame after it was
shown and so flashed at its default spot; placement is now synchronous with the render. On a phone the bottom sheet still comes from the bottom edge; if the
toolbar has been moved into that area it stays on top of the sheet and can be dragged away.

## Guardrails

- **No PHI.** The audience is practice owners, so no warning in the compose box. Comments are stored only in the Durable Object, are not
  logged by the Worker (no request body logging, no `console.log` of fields), and reach this repo only
  through `pull` into git-ignored `.work/`. Do not commit exports.
- **Rights and privacy.** Previews stay private and noindex. The widget never loads on a published site.
- **Secrets.** The admin token never goes in a site, the repo, or a screenshot. Only the site key is in
  built pages.
- **pnpm only**; verify `pnpm install --frozen-lockfile` after dependency changes (wrangler, vitest,
  the Workers test pool).

## Later (not scheduled)

An approve action (and whether it counts as consent to publish);
notifications to Daniel; screenshots or a reproducible viewport replay through `packages/shots`; an
`apply-feedback` skill that reads the export; named variants of a site; mounting under the preview
router; retention and deletion after a site goes live.

## Open questions

1. Which Cloudflare account, and a workers.dev hostname for now or a custom one? (Phase 5 only.)
2. Site key: trust on first use, or always registered by `pnpm feedback register`? TOFU is less
   friction but lets anyone who guesses a slug claim it first. Recommended: explicit register, run as
   part of the publish step.
3. Cap and rate numbers above are guesses; fine for now?
