/**
 * دو تمِ Shiki را به `src/core/highlight/themes.ts` می‌نویسد.
 *
 * ★ **چرا vendor و نه import:** worker باید **خودکفا** باشد (دلیلش در
 * `tsup.config.ts`). ولی `import { bundledThemes } from "shiki/themes"`
 * هر ~۶۰ تم را می‌آورد — اندازه‌گیری شد: ۲۲۲ کیلوبایتِ gzip برای دو
 * تمی که واقعاً لازم داریم. مسیرِ تکیِ `@shikijs/themes/github-light`
 * هم از این پکیج resolve نمی‌شود (وابستگیِ گذرا است، نه مستقیم).
 *
 * پس همان دو فایل یک‌بار در زمانِ بیلد خوانده و درون‌خط می‌شوند: ~۲۵
 * کیلوبایتِ خام به‌جای ۱٫۵ مگابایت.
 *
 * اجرا: `pnpm --filter nila-markdown vendor:themes`
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const shikiDist = dirname(require.resolve("shiki"));
const themesEntry = require.resolve("@shikijs/themes", { paths: [shikiDist] });
const themesDist = dirname(themesEntry);

const NAMES = ["github-light", "github-dark"];
const out = {};

for (const name of NAMES) {
  const mod = await import(pathToFileURL(join(themesDist, `${name}.mjs`)).href);
  out[name] = mod.default;
}

const banner = `// ساخته‌شده — دست نزنید. \`pnpm --filter nila-markdown vendor:themes\`
//
// دو تمِ Shiki، درون‌خط. دلیلش در \`scripts/vendor-themes.mjs\` و
// \`tsup.config.ts\` نوشته شده: worker باید خودکفا باشد و
// \`shiki/themes\` هر ~۶۰ تم را می‌آورد.

export const GITHUB_LIGHT = ${JSON.stringify(out["github-light"])} as unknown as Record<string, unknown>;

export const GITHUB_DARK = ${JSON.stringify(out["github-dark"])} as unknown as Record<string, unknown>;
`;

writeFileSync(new URL("../src/core/highlight/themes.ts", import.meta.url), banner);
console.log("wrote src/core/highlight/themes.ts");
