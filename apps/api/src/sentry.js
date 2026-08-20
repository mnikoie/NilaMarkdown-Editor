// گزارشِ خطا به Sentry.
//
// بی SENTRY_DSN این فایل عمداً کاری نمی‌کند و می‌گوید خاموش است. DSN را از
// داشبوردِ خودت بردار و در .env بگذار.
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN ?? "";

export const sentryEnabled = Boolean(dsn);

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
} else {
  console.warn("SENTRY_DSN تنظیم نشده — گزارشِ خطا خاموش است.");
}

export { Sentry };
