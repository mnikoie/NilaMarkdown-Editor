import { test, expect } from "@playwright/test";

// تستِ نمونه — بی نیاز به سرورِ در حالِ اجرا، تا از همان اول سبز باشد.
// تستِ واقعیِ خودت را کنارش بنویس و baseURL را در E2E_BASE_URL بگذار.
test("محیطِ تست آماده است", async () => {
  expect(1 + 1).toBe(2);
});
