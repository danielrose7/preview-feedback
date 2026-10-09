// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { anchorFor, findAnchor, sectionLabel } from "../src/anchor";

function page(): void {
  document.body.innerHTML = `
    <header><a href="/">Home</a></header>
    <main id="main">
      <div id="hero" data-section="hero"><section><h1>Acupuncture in <em>Portland</em></h1><p>Gentle care.</p><div data-x>x</div></section></div>
      <div id="faq" data-section="faq"><section>
        <details><summary>Does it hurt?</summary><p>Rarely.</p></details>
        <details><summary>How many visits?</summary><p>It varies.</p></details>
      </section></div>
    </main>
    <footer><p>© Molly</p></footer>
    <preview-feedback></preview-feedback>`;
}

beforeEach(page);

describe("anchorFor", () => {
  it("uses the section wrapper id and a path inside it", () => {
    const a = anchorFor(document.querySelector("#hero h1")!);
    expect(a.anchor_id).toBe("hero");
    expect(a.anchor_path).toBe("section > h1");
    expect(a.anchor_text).toBe("Acupuncture in Portland");
  });

  it("disambiguates siblings with nth-of-type", () => {
    const a = anchorFor(document.querySelectorAll("#faq summary")[1]!);
    expect(a.anchor_id).toBe("faq");
    expect(a.anchor_path).toBe("section > details:nth-of-type(2) > summary");
  });

  it("falls back to a body-relative path outside any section", () => {
    const a = anchorFor(document.querySelector("footer p")!);
    expect(a.anchor_id).toBeNull();
    expect(a.anchor_path).toBe("footer > p");
  });

  it("names a section that has no id by type and position", () => {
    document.querySelector("#faq")!.removeAttribute("id");
    document.querySelector("[data-section=faq]")!.setAttribute("data-section", "faq-2");
    const a = anchorFor(document.querySelector("[data-section=faq-2] summary")!);
    expect(a.anchor_id).toBe("faq-2");
    expect(findAnchor(document, a)?.tagName).toBe("SUMMARY");
  });

  it("separates adjacent elements with a space", () => {
    document.querySelector("#hero section")!.innerHTML = "<h1>One</h1><h2>Two</h2>";
    expect(anchorFor(document.querySelector("#hero section")!).anchor_text).toBe("One Two");
  });

  it("points at the section itself with no path", () => {
    const a = anchorFor(document.querySelector("[data-section=hero]")!);
    expect(a.anchor_id).toBe("hero");
    expect(a.anchor_path).toBeNull();
  });

  it("ignores the widget", () => {
    const a = anchorFor(document.querySelector("preview-feedback")!);
    expect(a).toEqual({ anchor_id: null, anchor_path: null, anchor_text: null, anchor_dx: null, anchor_dy: null });
  });

  it("truncates long text", () => {
    document.querySelector("#hero p")!.textContent = "x ".repeat(200);
    expect(anchorFor(document.querySelector("#hero p")!).anchor_text!.length).toBeLessThanOrEqual(120);
  });
});

describe("pin position", () => {
  const rect = (l: number, t: number, w: number, h: number) =>
    ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t, toJSON() {} }) as DOMRect;

  it("records where inside the element the click landed", () => {
    const h1 = document.querySelector("#hero h1")!;
    h1.getBoundingClientRect = () => rect(100, 200, 400, 50);
    const a = anchorFor(h1, { x: 300, y: 212.5 });
    expect([a.anchor_dx, a.anchor_dy]).toEqual([0.5, 0.25]);
  });

  it("clamps a click that lands outside the element's box", () => {
    const h1 = document.querySelector("#hero h1")!;
    h1.getBoundingClientRect = () => rect(100, 200, 400, 50);
    const a = anchorFor(h1, { x: 900, y: 0 });
    expect([a.anchor_dx, a.anchor_dy]).toEqual([1, 0]);
  });

  it("is null with no click, or an element with no box", () => {
    const h1 = document.querySelector("#hero h1")!;
    expect([anchorFor(h1).anchor_dx, anchorFor(h1).anchor_dy]).toEqual([null, null]);
    h1.getBoundingClientRect = () => rect(0, 0, 0, 0);
    expect(anchorFor(h1, { x: 5, y: 5 }).anchor_dx).toBeNull();
  });
});

describe("findAnchor", () => {
  it("round-trips an anchor", () => {
    const target = document.querySelectorAll("#faq summary")[1]!;
    expect(findAnchor(document, anchorFor(target))).toBe(target);
  });

  it("finds the element by text when the structure shifted", () => {
    const a = anchorFor(document.querySelectorAll("#faq summary")[1]!);
    document.querySelector("#faq section")!.insertAdjacentHTML("afterbegin", "<div>banner</div>");
    // The old path now points at a different <details>; text must win over a wrong hit.
    document.querySelector("#faq details:nth-of-type(1)")!.remove();
    expect(findAnchor(document, a)?.textContent).toBe("How many visits?");
  });

  it("falls back to the section when the text is gone", () => {
    const a = anchorFor(document.querySelector("#hero h1")!);
    document.querySelector("#hero h1")!.textContent = "Totally new headline";
    expect(findAnchor(document, a)?.getAttribute("data-section")).toBe("hero");
  });

  it("returns null when the section is gone", () => {
    const a = anchorFor(document.querySelector("#hero h1")!);
    document.querySelector("[data-section=hero]")!.remove();
    expect(findAnchor(document, a)).toBeNull();
  });

  it("survives a malformed stored path", () => {
    expect(findAnchor(document, { anchor_id: "hero", anchor_path: "((", anchor_text: "Gentle care.", anchor_dx: null, anchor_dy: null })?.textContent).toBe("Gentle care.");
  });
});

describe("sectionLabel", () => {
  it("humanizes ids", () => {
    expect(sectionLabel("first-visit")).toBe("first visit section");
    expect(sectionLabel(null)).toBeNull();
  });
});
