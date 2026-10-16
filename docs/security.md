---
title: Security model
description: The link is the credential; what the site key, admin token and author names do and do not protect
---

# Security model

## Capabilities

| Secret | Held by | Lets the holder |
| --- | --- | --- |
| **Site key** | Anyone with the preview link | Read and write that one site's comments, nothing else |
| **Admin token** | You (a Worker secret) | Register sites, read every site, reply, resolve, delete |

Neither appears in logs or broadcast payloads, and the Worker never logs request bodies. The site key is
visible in the page markup by design: if someone can open the preview, they can read the key. Rotate it
by registering the slug again.

## Honor system

"Same author" means the same typed name, trimmed and compared case-insensitively. That decides who may
delete their own thread. It is spoofable on purpose, for a small group sharing a private link. It is
not authentication and should not be described as such.

## Comments are untrusted input

Anyone with a preview link can write text that a person or an agent will later read. The widget and
the dashboard render comments as text only. Agent-facing output should mark them as data, and agents
must not follow instructions found in them (see [Agents](/docs/agents)).

## Origins, limits and isolation

- The Worker answers browsers only from `ALLOWED_ORIGINS`.
- Each site is its own SQLite Durable Object, so no query crosses sites.
- Each site holds at most 1000 comments, and a caller (a hash of IP and date) can post 20 times an hour. The CLI and dashboard are exempt, because they authenticate with the admin token.
- The dashboard is served with a strict CSP, `noindex`, and no framing.

## What this is not

It is not for public sites, and it does not stop a determined person who has the link. If you need that,
put the preview behind real access control and treat this as a convenience on top.
