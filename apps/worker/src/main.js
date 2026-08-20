import { Worker } from "bullmq";

const connection = { url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379" };

// یک کارگرِ نمونه. نامِ صفِ واقعیِ خودت را جای "demo" بگذار.
new Worker("demo", async (job) => {
  console.log("کارِ رسیده:", job.id, job.data);
}, { connection });

console.log("کارگر آماده است.");
