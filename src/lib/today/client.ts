/**
 * Which app version made a car API call, for the log line: the car sends
 * `client=car-<versionName>` in the query (agreed with the car session,
 * 2026-11-10). The User-Agent cannot do this job: App Hosting's front end
 * hands every request to the app as "Google".
 *
 * Optional and forgiving: a missing or malformed tag logs as "-" and never
 * fails the call, so a typo cannot break the car. The pattern keeps the log
 * line to letters, digits, dots and dashes.
 */
/**
 * The tag's shape: lowercase letters, digits, dots and dashes, starting with
 * a letter or digit, at most 40 characters. That fits "car-0.2.0" and any
 * version name the car session plans, and nothing else can reach the log: no
 * spaces, quotes or newlines to forge or split a line, and a length that
 * keeps a line short. Agreed with the car session (2026-11-10); widening it
 * (uppercase for "RC1", say) is a change to tell the car about and to test in
 * __tests__/client.test.ts.
 */
const CLIENT = /^[a-z0-9][a-z0-9.-]{0,39}$/;

export function clientTag(url: string): string {
  try {
    const raw = new URL(url).searchParams.get("client") ?? "";
    return CLIENT.test(raw) ? raw : "-";
  } catch {
    return "-";
  }
}
