import {
  inputRules,
  wrappingInputRule,
  textblockTypeInputRule,
  InputRule,
} from "prosemirror-inputrules";
import type { Plugin } from "prosemirror-state";
import { schema } from "../schema/index.js";
import type { MarkRegistry } from "../directives/types.js";
import { BUILTIN_MARKS } from "../directives/builtin.js";

/**
 * قواعدِ ورودی — تبدیلِ حینِ تایپ.
 *
 * نکتهٔ فارسی: کاربرِ فارسی‌زبان ممکن است ارقامِ فارسی تایپ کند. قاعدهٔ
 * فهرستِ شماره‌دار هر دو را می‌پذیرد (`۱.` و `1.`)، وگرنه کاربر فکر می‌کند
 * ادیتور خراب است.
 */

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function faToEn(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
}

/** `# ` تا `###### ` → عنوان */
const headingRule = textblockTypeInputRule(
  /^(#{1,6})\s$/,
  schema.nodes.heading,
  (match) => ({ level: match[1]!.length }),
);

/** `> ` → نقلِ قول */
const blockquoteRule = wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote);

/** `- ` یا `* ` یا `+ ` → فهرستِ نقطه‌ای — نشانهٔ خودِ کاربر حفظ می‌شود. */
const bulletListRule = wrappingInputRule(
  /^\s*([-+*])\s$/,
  schema.nodes.bullet_list,
  (match) => ({ marker: match[1] }),
);

/** `۱. ` یا `1. ` → فهرستِ شماره‌دار */
const orderedListRule = wrappingInputRule(
  /^(\d+|[۰-۹]+)\.\s$/,
  schema.nodes.ordered_list,
  (match) => ({ start: Number(faToEn(match[1]!)) }),
  (match, node) => node.childCount + (node.attrs.start as number) === Number(faToEn(match[1]!)),
);

/** ``` → بلوکِ کد */
const codeBlockRule = textblockTypeInputRule(/^```([a-zA-Z0-9]*)\s$/, schema.nodes.code_block, (m) => ({
  language: m[1] || null,
}));

/** `---` → جداکننده */
const hrRule = new InputRule(/^(?:---|___|\*\*\*)$/, (state, _match, start, end) => {
  return state.tr.replaceRangeWith(start, end, schema.nodes.horizontal_rule.create());
});

/**
 * `:::نام` → کارتِ مارک.
 *
 * فقط برای مارک‌هایی که `inputRule: true` دارند. اگر برای همه فعال باشد،
 * کاربری که واقعاً می‌خواهد `:::` بنویسد گیر می‌افتد.
 */
function directiveRules(registry: MarkRegistry): InputRule[] {
  const names = Object.values(registry)
    .filter((d) => d.inputRule && d.kind === "بلوکی")
    .map((d) => d.name);

  if (names.length === 0) return [];

  // نام‌ها را برای regex امن می‌کنیم — نامِ فارسی کاراکترِ خاصِ regex ندارد
  // ولی کاربر ممکن است نامی با `-` یا `.` بسازد.
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`^:::(${escaped.join("|")})\\s$`);

  return [
    new InputRule(pattern, (state, match, start, end) => {
      const name = match[1]!;
      const def = registry[name]!;
      const node = schema.nodes.directive_block.create(
        { name, attributes: {}, label: null },
        schema.nodes.paragraph.create(),
      );
      const tr = state.tr.replaceRangeWith(start, end, node);
      void def;
      return tr;
    }),
  ];
}

export function inputRulesPlugin(registry: MarkRegistry = BUILTIN_MARKS): Plugin {
  return inputRules({
    rules: [
      headingRule,
      blockquoteRule,
      bulletListRule,
      orderedListRule,
      codeBlockRule,
      hrRule,
      ...directiveRules(registry),
    ],
  });
}
