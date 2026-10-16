import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM helper
import { PAGES, parse, slugify } from "./lib.mjs";

const docs = path.resolve(__dirname, "../../docs");

describe("docs sources", () => {
  it("every listed page exists and has a title and description", () => {
    for (const name of PAGES) {
      const { meta, body } = parse(fs.readFileSync(path.join(docs, `${name}.md`), "utf8"));
      expect(meta.title, name).toBeTruthy();
      expect(meta.description, name).toBeTruthy();
      expect(body.startsWith("# "), `${name} starts with an h1`).toBe(true);
    }
  });

  it("internal /docs/ links point at listed pages", () => {
    const known = new Set(PAGES.filter((p: string) => p !== "index"));
    for (const name of PAGES) {
      const src = fs.readFileSync(path.join(docs, `${name}.md`), "utf8");
      for (const m of src.matchAll(/\]\(\/docs\/([a-z-]*)(?:#[^)]*)?\)/g)) {
        if (m[1]) expect(known.has(m[1]), `${name} -> ${m[1]}`).toBe(true);
      }
    }
  });
});

describe("helpers", () => {
  it("parses front matter and strips it from the body", () => {
    const r = parse("---\ntitle: A: b\ndescription: c\n---\n\n# H\n");
    expect(r.meta).toEqual({ title: "A: b", description: "c" });
    expect(r.body).toBe("# H\n");
  });
  it("slugifies headings, ignoring markup", () => {
    expect(slugify("The <code>x</code> API!")).toBe("the-x-api");
  });
});
