/**
 * انواعِ ساختاریِ سندِ حقوقی — به‌عنوانِ مارکِ از پیش‌تعریف‌شده.
 *
 * نکتهٔ معماری: اینها زیرسیستمِ دومی نیستند. دقیقاً همان مکانیزمِ مارکِ
 * سفارشیِ کاربرند، فقط از قبل ثبت شده‌اند. اگر فردا «رأی» یا «دادنامه»
 * اضافه شود، صفر خطِ کدِ جدید لازم است.
 *
 * `rank` عیناً از `RANK`ِ `structure_tree.py` آمده. اگر آنجا عوض شد،
 * اینجا هم باید عوض شود — وگرنه درختِ ادیتور با درختِ پایپ‌لاینِ ورود
 * فرق می‌کند و ارجاع‌ها به گرهِ اشتباه می‌خورند.
 */

import type { MarkRegistry } from "./types.js";

/** رتبهٔ عمق — کوچک‌تر = بیرونی‌تر. منبع: structure_tree.py → RANK */
export const RANK = {
  سند: 0,
  باب: 1,
  فصل: 2,
  قسمت: 3,
  بخش: 4,
  مبحث: 5,
  ماده: 6,
  تبصره: 7,
  بند: 8,
} as const;

export type StructuralType = keyof typeof RANK;

/**
 * صفاتِ مشترکِ همهٔ گره‌های ساختاری.
 *
 * `وضعیت` عمداً `گزینه‌ای` است نه متنِ آزاد: «منسوخ» و «نسخ‌شده» و «باطل»
 * اگر آزاد باشند سه رشتهٔ متفاوت می‌شوند و فیلترِ «فقط معتبرها» می‌شکند.
 */
const صفاتِ_ساختاری = [
  { name: "شماره", label: "شماره", type: "متن" as const },
  {
    name: "وضعیت",
    label: "وضعیت",
    type: "گزینه‌ای" as const,
    options: ["معتبر", "منسوخ", "اصلاح‌شده", "نامعلوم"],
    default: "نامعلوم",
  },
  { name: "تاریخ", label: "تاریخِ تصویب", type: "تاریخ" as const },
];

function ساختاری(
  name: StructuralType,
  color: string,
  extra: Partial<MarkRegistry[string]> = {},
): MarkRegistry[string] {
  return {
    name,
    label: name,
    kind: "بلوکی",
    color,
    variant: "نوار",
    collapsible: true,
    defaultOpen: true,
    titleFrom: "متن-تگ",
    anchor: true,
    rank: RANK[name],
    attrs: صفاتِ_ساختاری,
    ...extra,
  };
}

/**
 * فصل و باب و بخش عمداً اینجا نیستند — آنها با `#` نوشته می‌شوند تا سند در
 * هر ویوئرِ دیگری هم خوانا بماند. فقط چیزهایی directive می‌شوند که به
 * شماره و وضعیت و کارتِ رنگی نیاز دارند و `#` نمی‌تواند حملشان کند.
 */
export const BUILTIN_MARKS: MarkRegistry = {
  ماده: ساختاری("ماده", "#2563eb"),
  تبصره: ساختاری("تبصره", "#7c3aed", { defaultOpen: true }),
  بند: ساختاری("بند", "#0891b2", { collapsible: false }),

  /** نمونهٔ مارکِ غیرساختاری — همانی که کاربر در پرامپت مثال زد. */
  نکته: {
    name: "نکته",
    label: "نکتهٔ نویسنده",
    kind: "بلوکی",
    color: "#f59e0b",
    icon: "✍",
    variant: "کادر",
    collapsible: true,
    defaultOpen: true,
    titleFrom: "برچسب",
    counter: true,
    inputRule: true,
    attrs: [
      { name: "نوع", label: "نوع", type: "متن" },
      { name: "نویسنده", label: "نویسنده", type: "متن" },
    ],
  },

  هشدار: {
    name: "هشدار",
    label: "هشدار",
    kind: "بلوکی",
    color: "#dc2626",
    icon: "⚠",
    variant: "کادر",
    inputRule: true,
  },

  /** ارجاعِ بین‌سندی — بندِ ۱۸ـ۲ پرامپت. */
  ref: {
    name: "ref",
    label: "ارجاع",
    kind: "درون‌خطی",
    color: "#0969da",
    variant: "برچسب",
    attrs: [
      { name: "هدف", label: "هدف (شناسه#لنگر)", type: "متن", required: true },
      { name: "نوع", label: "نوعِ سند", type: "متن" },
    ],
  },
};
