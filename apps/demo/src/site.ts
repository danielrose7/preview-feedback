export const nav = [
  { href: "/", label: "Home" },
  { href: "/pricing/", label: "Pricing" },
  { href: "/about/", label: "About" },
  { href: "/contact/", label: "Contact" },
];

/** Present only when FEEDBACK_KEY is set, so a plain build has no trace of the widget. */
export const feedback = process.env.FEEDBACK_KEY && !process.env.FEEDBACK_OFF
  ? {
      endpoint: (process.env.FEEDBACK_ENDPOINT ?? "http://localhost:8787").replace(/\/$/, ""),
      slug: process.env.FEEDBACK_SLUG ?? "acme-demo",
      siteKey: process.env.FEEDBACK_KEY,
    }
  : undefined;
