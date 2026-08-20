// لاگرِ مشترکِ برنامه.
//
// دو نکته که در تولید مهم‌اند:
//  - سطحِ لاگ از env می‌آید تا بی تغییرِ کد قابلِ تنظیم باشد.
//  - داده‌های حساس (رمز، توکن، کوکی) پیش از نوشتن پنهان می‌شوند.
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: ["password", "token", "authorization", "cookie", "*.password", "*.token"],
    censor: "[پنهان‌شده]",
  },
});
