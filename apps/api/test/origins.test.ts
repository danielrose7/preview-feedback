import { describe, expect, it } from "vitest";
import { originAllowed } from "../src/validate";

describe("originAllowed", () => {
  it("lets * match any run except /, dots included", () => {
    const p = "https://*.pages.dev";
    expect(originAllowed("https://a.pages.dev", p)).toBe(true);
    expect(originAllowed("https://a.b.pages.dev", p)).toBe(true);
  });
  it("is anchored: scheme, suffix and bare host must all match", () => {
    const p = "https://*.pages.dev";
    expect(originAllowed("http://a.pages.dev", p)).toBe(false);
    expect(originAllowed("https://pages.dev", p)).toBe(false);
    expect(originAllowed("https://a.pages.dev.evil.com", p)).toBe(false);
  });
  it("matches a port wildcard and a list", () => {
    expect(originAllowed("http://localhost:4321", "https://x.test, http://localhost:*")).toBe(true);
    expect(originAllowed("http://localhost.evil.com", "http://localhost:*")).toBe(false);
  });
  it("shows why a pattern should start with the dot", () => {
    expect(originAllowed("https://evilexample.com", "https://*example.com")).toBe(true);
    expect(originAllowed("https://evilexample.com", "https://*.example.com")).toBe(false);
  });
});
