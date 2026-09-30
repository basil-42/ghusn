/** يعمل مرة عند بدء خادم Next.js: المهام الدورية على Node فقط (JOBS_DISABLED=1 لإيقافها). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.JOBS_DISABLED === "1") return;
  const { startJobs } = await import("./lib/jobs");
  await startJobs();
}
