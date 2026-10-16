---
title: Tenancy
description: Design for keeping each agency's data separate on one Worker (not built yet)
---

# Tenancy: keeping each agency's data separate

Status: design, not built. Decide before a second agency uses this; cheap to do now, costly after data
exists.

## Terms

- **Workspace**: one agency (the tenant). Owns sites, tokens and settings.
- **Site**: one preview project, with a slug unique within its workspace.
- **Thread**: a comment and its replies, belonging to one site.

## Isolation: where the boundary is

**One Durable Object per site**, named `w/<workspace>/s/<slug>`. Each is its own SQLite database, so no
query can ever cross sites or workspaces. This is the strongest separation the platform offers and it
is what we already do (today the name is just the slug).

A small **workspace object** per workspace holds the things that span its sites: its tokens (hashed),
its list of sites, and its settings. Listing a workspace's sites never touches another workspace.

The boundary is enforced in **one place**: a `resolveSite(request)` that parses the workspace and slug,
authenticates the credential *for that workspace*, and returns the right stub. Route handlers never
build a stub from user input themselves. Tests include a cross-workspace denial matrix (every
credential type against every other workspace's resources).

## Credentials, narrowest first

| Credential | Held by | Can | Stored |
| --- | --- | --- | --- |
| **Site key** | anyone with the preview link | read and write that one site's threads (post, reply, resolve, reopen, delete own) | hash, in the site object |
| **Agent token** | a coding agent or script | read, reply, resolve on one site or a workspace; never delete, never rotate keys | hash, in the workspace object; revocable, named |
| **Workspace token** | the agency's staff | everything inside their workspace: create and rotate sites, export, delete any thread, manage agent tokens | hash, in the workspace object; several, named, revocable |
| **Operator token** | whoever runs the Worker | create workspaces and their first token | a Worker secret; never handed out |

Tokens are random, compared by hash, shown once. None appears in logs or broadcast payloads.

## URLs

`/w/:workspace/sites/:slug/...` for everything. A default workspace named `default` keeps the
single-tenant case simple: the widget's optional `workspace` attribute defaults to it, and the CLI
takes `--workspace` or `FEEDBACK_WORKSPACE`. The current flat `/sites/:slug/...` routes are the
`default` workspace and can stay as aliases.

## Allowed origins move from config to the site

Today `ALLOWED_ORIGINS` is one Worker-wide variable. With several agencies each site needs its own list
(stored in its site object, editable with a workspace token). A request from an origin not on that
site's list is refused, and preflight asks the site object (cached briefly in memory). `localhost` stays
allowed for development.

## Two ways to run it

1. **Shared Worker, many workspaces.** One deployment, the operator creates workspaces. The default for
   us.
2. **A Worker per agency.** An agency deploys its own copy with its own Cloudflare account and uses the
   `default` workspace. Same code; the strongest isolation and data ownership, at the cost of each
   agency running infrastructure.

Both come from the same design, so we do not have to choose now.

## Limits and housekeeping

- Per-site comment cap and rate limit (exist), a per-workspace site cap, and a per-workspace request
  budget.
- **Deleting a site deletes its data**: the site object's storage is wiped (`deleteAll`) and the workspace
  registry entry removed. Export before delete is a CLI command.
- No cross-workspace analytics, and the Worker never logs comment bodies.
- Retention: a workspace-level setting for how long a site's data is kept after its last activity, off by
  default.

## Migration

Nothing is deployed yet, so the move from "slug" to "workspace + slug" costs a function that builds the
object name. If data existed under bare slugs, it would map to `w/default/s/<slug>` by name alone.

## Open questions

- Do agencies sign up themselves, or does the operator create workspaces by hand for now? (By hand, to
  start.)
- Should an agent token be allowed to create threads, or only respond? (Respond only, to start.)
- Display of the workspace to reviewers: nothing. Reviewers see only their site.
