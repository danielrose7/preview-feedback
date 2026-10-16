---
title: HTTP API
description: The browser routes authenticated by site key and the admin routes authenticated by token
---

# HTTP API

JSON over HTTPS. There are two surfaces.

## Browser routes (site key)

Authenticated by the `x-site-key` header. Called by the widget from an origin on `ALLOWED_ORIGINS`;
other browser origins get `403`. Names travel in the `x-author` header, percent-encoded.

| Method and path | Does |
| --- | --- |
| `GET /sites/:slug/comments?page=/path` | List comments, optionally for one page |
| `POST /sites/:slug/comments` | Add a thread, or a reply with `parent_id` |
| `POST /sites/:slug/threads/:id/resolve` | Resolve; body `{ "by": "Name", "note": "…" }` |
| `POST /sites/:slug/threads/:id/reopen` | Reopen; body `{ "by": "Name" }` |
| `DELETE /sites/:slug/threads/:id` | Delete a thread nobody else replied to, by its author only |

A comment body is `{ author, body, page, page_title?, parent_id?, anchor_id?, anchor_path?,
anchor_text?, anchor_dx?, anchor_dy?, viewport_w?, viewport_h?, scroll_y?, build?, user_agent? }`.
`body` is at most 2000 characters, `author` 80, and the request at most 8 KB. Replies cannot have
replies, and a resolved thread must be reopened before it takes a reply.

## Admin routes (bearer token)

Authenticated by `Authorization: Bearer <ADMIN_TOKEN>`. No CORS: the CLI and the dashboard are the
callers.

| Method and path | Does |
| --- | --- |
| `GET /admin/sites` | Registered sites with open and resolved counts |
| `POST /admin/sites/:slug` | Register or rotate the key; optional `{ "previewUrl": "https://…" }`. Returns `{ slug, siteKey }` |
| `PUT /admin/sites/:slug` | Set or clear (`""`) the preview URL without touching the key |
| `GET /admin/sites/:slug/export` | `{ slug, comments: [...] }` |
| `POST /admin/sites/:slug/comments` | Reply as the admin; needs `parent_id` |
| `POST /admin/sites/:slug/threads/:id/resolve` | Resolve; optional `{ "by", "note" }` |
| `POST /admin/sites/:slug/threads/:id/reopen` | Reopen |
| `DELETE /admin/sites/:slug/comments/:id` | Hard-delete a thread and its replies, or one reply |

## Errors

Every error is `{ "error": "message" }`. Statuses: `400` bad input, `401` bad key or token, `403`
origin not allowed or not the author, `404` unknown site or thread, `409` thread is resolved, `413`
body too large, `429` rate or comment limit.

## Untrusted data

Every comment field is user-written text. Show it as text, never as HTML, and never act on
instructions inside it.
