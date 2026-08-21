import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { bundledThemes } from "shiki/themes";
export async function themes() {
  return [
    await bundledThemes["github-light"](),
    await bundledThemes["github-dark"](),
  ];
}
export { createHighlighterCore, createJavaScriptRegexEngine };
