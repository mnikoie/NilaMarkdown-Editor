import { JSDOM } from "jsdom";
import { exportHtml, parse, serialize } from "../dist/index.js";

const COMMONMARK_URL = "https://spec.commonmark.org/0.31.2/spec.json";
const GFM_URL = "https://raw.githubusercontent.com/github/cmark-gfm/master/test/extensions.txt";

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

function parseGfmExamples(source) {
  const lines = source.split(/\r?\n/);
  const examples = [];
  let section = "";
  for (let i = 0; i < lines.length; i++) {
    const heading = /^(#{2,4})\s+(.+)$/.exec(lines[i]);
    if (heading) section = heading[2];
    if (!/^`{20,}\s+example\s*$/.test(lines[i])) continue;
    const markdown = [];
    const html = [];
    i++;
    while (i < lines.length && lines[i] !== ".") markdown.push(lines[i++]);
    i++;
    while (i < lines.length && !/^`{20,}\s*$/.test(lines[i])) html.push(lines[i++]);
    examples.push({
      example: examples.length + 1,
      section,
      markdown: `${markdown.join("\n").replaceAll("→", "\t")}\n`,
      html: `${html.join("\n").replaceAll("→", "\t")}\n`,
    });
  }
  return examples;
}

function semanticSignature(html) {
  const body = new JSDOM(`<body>${html}</body>`).window.document.body;
  const ignored = new Set(["thead", "tbody", "tfoot"]);
  const aliases = new Map([["s", "del"]]);
  const walk = (node) => {
    if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, " ");
    if (node.nodeType !== 1) return "";
    const raw = node.tagName.toLowerCase();
    const tag = aliases.get(raw) ?? raw;
    const children = [...node.childNodes].map(walk).join("");
    if (ignored.has(tag)) return children;
    const attrs = [];
    for (const name of ["href", "src", "title", "start", "type", "checked", "align"]) {
      if (node.hasAttribute(name)) attrs.push(`${name}=${node.getAttribute(name) ?? ""}`);
    }
    if (!node.hasAttribute("align")) {
      const align = node.style?.textAlign;
      if (align) attrs.push(`align=${align}`);
    }
    attrs.sort();
    return `<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}>${children}</${tag}>`;
  };
  return [...body.childNodes].map(walk).join("").trim();
}

function evaluate(name, examples) {
  let parsed = 0;
  let stable = 0;
  let sourceExact = 0;
  let semantic = 0;
  const failures = [];
  const unstableExamples = [];
  const semanticMismatches = [];
  for (const item of examples) {
    try {
      const doc = parse(item.markdown);
      parsed++;
      const once = serialize(doc);
      if (serialize(parse(once)) === once) stable++;
      else if (unstableExamples.length < 20) unstableExamples.push({ example: item.example, section: item.section });
      if (once === item.markdown) sourceExact++;
      const actualHtml = exportHtml(doc, { standalone: false, html: "raw" });
      if (semanticSignature(actualHtml) === semanticSignature(item.html)) semantic++;
      else if (semanticMismatches.length < 20) semanticMismatches.push({ example: item.example, section: item.section });
    } catch (error) {
      if (failures.length < 20) failures.push({ example: item.example, section: item.section, error: String(error) });
    }
  }
  return { name, total: examples.length, parsed, stable, sourceExact, semantic, failures, unstableExamples, semanticMismatches };
}

const commonmark = JSON.parse(await fetchText(COMMONMARK_URL));
const gfm = parseGfmExamples(await fetchText(GFM_URL));
const report = {
  generatedAt: new Date().toISOString(),
  sources: { commonmark: COMMONMARK_URL, gfm: GFM_URL },
  suites: [evaluate("CommonMark 0.31.2", commonmark), evaluate("GFM extensions", gfm)],
};

console.log(JSON.stringify(report, null, 2));
if (report.suites.some((suite) => suite.parsed !== suite.total)) process.exitCode = 1;
