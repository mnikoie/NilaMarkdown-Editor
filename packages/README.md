# `packages/` — کامپوننت‌های قابلِ استفادهٔ مجدد

هر چیزی که قرار است **بیرون از این پروژه هم استفاده شود** اینجا زندگی می‌کند،
نه داخلِ `apps/`. هر پوشه یک پکیجِ مستقل با نسخهٔ خودش است و مثلِ هر پکیجِ
دیگری با `pnpm add` نصب می‌شود.

```
packages/
  markdown/        nila-markdown        ویرایشگر و نمایشگرِ Markdown
  ui/              @workspace/ui          کامپوننت‌های داخلی
  shared-types/    @workspace/shared-types
  api-client/      @workspace/api-client
  config/          @workspace/config
```

## دو جنسِ پکیج

فرقشان در `private` و در scopeِ نام است، و این فرق عمدی است:

| | داخلی | منتشرشدنی |
|---|---|---|
| scope | `@workspace/*` | `@tamin/*` |
| `private` | `true` | حذف می‌شود |
| `main` | `src/index.ts` | `dist/` با `exports` |
| بیلد | ندارد — باندلرِ اپ خودش TS را می‌فهمد | دارد — پروژهٔ بیرونی TS خام را نمی‌فهمد |
| نسخه | `0.0.0` و ثابت | با Changesets بالا می‌رود |

اگر پکیجی قرار نیست هرگز منتشر شود، داخلی نگهش دار — بیلد و نسخه‌بندی
هزینه‌اند و بی‌دلیل پرداختنشان فقط کُندی می‌آورد.

## ساختنِ پکیجِ منتشرشدنیِ نو

```
packages/<name>/
  src/
    index.ts          نقطهٔ ورودِ اصلی
  package.json
  tsconfig.json
  tsup.config.ts
  README.md
  CHANGELOG.md        خودِ Changesets می‌نویسدش
```

`package.json`ِ کمینه:

```jsonc
{
  "name": "@tamin/<name>",
  "version": "0.1.0",
  "type": "module",
  "sideEffects": ["*.css"],
  "files": ["dist"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./styles.css": "./dist/styles.css"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": { "react": ">=18", "react-dom": ">=18" },
  "publishConfig": { "access": "public" }
}
```

### سه چیزی که فراموششان گران تمام می‌شود

**۱. `react` باید `peerDependencies` باشد، نه `dependencies`.**
اگر `dependencies` بگذاری، پروژهٔ مصرف‌کننده دو نسخهٔ React خواهد داشت و با
`Invalid hook call` می‌شکند — خطایی که ساعت‌ها وقت می‌گیرد چون به جای واقعیِ
مشکل اشاره نمی‌کند.

**۲. `sideEffects` باید فایل‌های CSS را نام ببرد.**
بی آن، باندلرِ مصرف‌کننده استایل‌ها را «کدِ مرده» می‌بیند و حذفشان می‌کند.
کامپوننت کار می‌کند ولی بی‌قیافه است.

**۳. `files` را محدود کن.**
بی آن، کلِ پوشه — با `src` و تست و کانفیگ — منتشر می‌شود.

## مصرف داخلِ همین مونوریپو

```jsonc
"dependencies": { "nila-markdown": "workspace:*" }
```

`workspace:*` یعنی «از پوشهٔ کناری بردار». pnpm موقعِ انتشار خودش آن را به
نسخهٔ واقعی تبدیل می‌کند، پس لازم نیست چیزی را دستی هماهنگ کنی.

## نسخه‌بندی

```bash
pnpm changeset          # چه چیزی عوض شد و چقدر (patch/minor/major)
pnpm changeset version  # نسخه‌ها را بالا می‌برد و CHANGELOG می‌نویسد
pnpm publish -r         # منتشر می‌کند
```

هر پکیج نسخهٔ مستقلِ خودش را دارد. تغییر در `markdown` نسخهٔ `ui` را تکان
نمی‌دهد.
