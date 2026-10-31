import { readFile } from 'node:fs/promises';

// The user-supplied checker remains local and ignored: it contains credentials.
export async function checkUsage(path = new URL('../check_usage.js', import.meta.url)) {
  let result;
  const source = await readFile(path, 'utf8');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('console', source)({ log(value) { result = value; } });
  if (!result?.rate_limit || typeof result.rate_limit.allowed !== 'boolean') {
    throw new Error('Usage response unavailable');
  }
  return {
    allowed: result.rate_limit.allowed && !result.rate_limit.limit_reached,
    usedPercent: result.rate_limit.primary_window?.used_percent,
    resetAt: result.rate_limit.primary_window?.reset_at,
    weeklyUsedPercent: result.rate_limit.secondary_window?.used_percent,
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const timer = setTimeout(() => { console.error('Usage check timed out'); process.exit(2); }, 30000);
  try { console.log(JSON.stringify(await checkUsage())); }
  catch { console.error('Usage check failed; no credentials logged'); process.exitCode = 2; }
  finally { clearTimeout(timer); }
}
