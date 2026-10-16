import { useEffect } from "react";
import { mount } from "@preview-feedback/widget";

export function Feedback() {
  useEffect(() => {
    const endpoint = import.meta.env.VITE_FEEDBACK_ENDPOINT;
    const siteKey = import.meta.env.VITE_FEEDBACK_KEY;
    if (!endpoint || !siteKey) return; // no key, no widget
    return mount({ endpoint, slug: import.meta.env.VITE_FEEDBACK_SLUG ?? "react-example", siteKey });
  }, []);
  return null;
}
