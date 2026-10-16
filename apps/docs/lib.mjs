// Pure helpers for the docs build, kept apart so they can be tested.

/** Fixed order: drives the nav, llms.txt and llms-full.txt. */
export const PAGES = ["index", "getting-started", "embedding", "packaging", "reviewing", "agents", "api", "self-host", "security", "tenancy", "roadmap"];

/** Front matter is `key: value` lines between two `---` fences. */
export function parse(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = Object.fromEntries(
    (m?.[1] ?? "").split("\n").filter(Boolean).map((line) => {
      const i = line.indexOf(":");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
  );
  return { meta, body: m ? src.slice(m[0].length).trimStart() : src };
}

export function slugify(html) {
  return html.replace(/<[^>]+>/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
