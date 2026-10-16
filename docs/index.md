---
title: preview-feedback docs
description: Honor-system feedback for private website previews: pins, threads, resolve, no accounts, no extension
---

# preview-feedback

A reviewer opens a preview link, drops a pin on the page, and writes a comment. No account, no browser
extension. Think of the Vercel toolbar's comments, but for any host, with nothing to install: the
unguessable link is the access control.

## How it works, in one paragraph

You register a site and get a **site key**. You add one `<script>` and one `<preview-feedback>` element
to your private preview. Anyone who opens that preview sees a toolbar, can click anywhere to pin a
comment, reply, resolve and reopen threads, and browse an inbox across pages. Comments live in one
SQLite Durable Object per site on a Cloudflare Worker. You read, answer and resolve them from a
self-hosted dashboard at `/studio/` or from a CLI, and a coding agent can work the same loop.

## Guides

- [Getting started](/docs/getting-started): register a site, embed the widget, leave a first pin
- [Embedding](/docs/embedding): every attribute, the bundler API, and how pins anchor to the page
- [Packaging](/docs/packaging): how the widget is distributed, and the setup for publishing it to npm
- [Reviewing feedback](/docs/reviewing): the dashboard and the CLI
- [Agents](/docs/agents): let a coding agent pull open threads, change the site, reply and resolve
- [HTTP API](/docs/api): the browser routes and the admin routes
- [Self-hosting](/docs/self-host): deploy your own Worker to Cloudflare
- [Security model](/docs/security): the link is the credential, and what that does and does not mean
- [Tenancy](/docs/tenancy): the design for several agencies on one Worker (not built yet)
- [Roadmap](/docs/roadmap)

## Principles

- **The link is the credential.** No accounts, no logins. A site key lets whoever holds the preview
  link read and write that one site's comments, nothing else.
- **Comments are untrusted input.** They are rendered as text, never HTML, and marked as data in
  anything an agent reads.
- **Honor system, on purpose.** "Same author" means the same typed name. It is spoofable by design, for
  a small group sharing a private link.
- **Nothing left behind.** Removing `<preview-feedback>` undoes everything it registered.

The source is at [github.com/danielrose7/preview-feedback](https://github.com/danielrose7/preview-feedback).
