import { readFile } from "node:fs/promises";

const messages = JSON.parse(
  await readFile(new URL("archify-viewer-en.json", import.meta.url), "utf8"),
);
const content = new Map(
  (await readFile(new URL("archify-content-en.txt", import.meta.url), "utf8"))
    .trim().split(/\r?\n/).map((line) => line.split("|")),
);
const viewerData = /(<script id="archify-i18n-data" type="application\/json">)([\s\S]*?)(<\/script>)/;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeHTML = (s) => s.replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]);

export function englishLabel(value) {
  return content.get(value) ?? value;
}

// Localize only the checked presentation copy. The pinned source and its
// download, original HTML, reading sheet, and provenance pins stay intact.
export function englishPresentation(html) {
  const labels = new Map();
  const viewer = html.match(viewerData);
  if (viewer) {
    const original = JSON.parse(viewer[2]);
    if (original.locale !== "es" ||
        Object.keys(original.messages).length !== Object.keys(messages).length ||
        !Object.keys(original.messages).every((key) => Object.hasOwn(messages, key)))
      throw new Error("Unexpected Archify translation catalog");
    for (const [key, phrase] of Object.entries(original.messages)) {
      if (phrase && phrase !== messages[key] && !labels.has(phrase))
        labels.set(phrase, messages[key]);
    }
    const english = JSON.stringify({ locale: "en", messages }).replace(/</g, "\\u003c");
    html = html.replace(viewerData, (_, open, _data, close) => open + english + close);
  }
  for (const [spanish, english] of content) labels.set(spanish, english);
  const escaped = new Map();
  for (const [spanish, english] of labels) {
    escaped.set(spanish, escapeHTML(english));
    escaped.set(escapeHTML(spanish), escapeHTML(english));
  }
  const pattern = new RegExp(
    "(?<![\\p{L}\\p{N}_-])(?:" +
      [...escaped.keys()].sort((a, b) => b.length - a.length).map(escapeRegex).join("|") +
      ")(?![\\p{L}\\p{N}_-])",
    "gu",
  );
  const translate = (value) => value.replace(pattern, (match) => escaped.get(match));
  const descriptive = /((?:\baria-label|\btitle|\balt|\bplaceholder|\bdata-(?:node-(?:label|sublabel|context|tag)|composition-frame-label|edge-label|legend-label|preset-badge-[a-z-]+)|\bcontent)=")([^"]*)(")/g;
  return html.replace(/\blang="es"/g, 'lang="en"')
    .split(/(<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>)/i)
    .map((part, index) => index % 2 === 0
      ? part.replace(/<!--[^]*?-->|<[^>]*>|[^<]+/g, (segment) =>
          segment.startsWith("<!--") ? segment :
          segment.startsWith("<")
            ? segment.replace(descriptive, (_, open, value, close) => open + translate(value) + close)
            : translate(segment))
      : part).join("");
}
