/**
 * Vote deadlines come from the server clock. A viewer's computer can be off by seconds or minutes,
 * so countdowns use the server's HTTP Date header to estimate the difference.
 */
let offsetMs = 0;
let observed = false;

export function observeServerDate(
  header: string | null,
  receivedAt = Date.now(),
): void {
  if (!header) return;
  const server = Date.parse(header);
  if (!Number.isFinite(server)) return;
  // The header has one-second resolution; assume the midpoint of that second.
  const estimate = server + 500 - receivedAt;
  // Smooth successive readings so a slow response does not make the countdown jump.
  offsetMs = observed ? Math.round(offsetMs * 0.7 + estimate * 0.3) : estimate;
  observed = true;
}

export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function resetServerClock(): void {
  offsetMs = 0;
  observed = false;
}
