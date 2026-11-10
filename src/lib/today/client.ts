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
const CLIENT = /^[a-z0-9][a-z0-9.-]{0,39}$/;

export function clientTag(url: string): string {
  try {
    const raw = new URL(url).searchParams.get("client") ?? "";
    return CLIENT.test(raw) ? raw : "-";
  } catch {
    return "-";
  }
}
