/**
 * The car app's "add this town" button (John, 2026-11-10: "Plus 'add this
 * town' button"). A typed destination the atlas lacks can be asked for by
 * name; requested towns are added in batches with the one-town recipe
 * (docs/atlas-gaps.md, "Adding one town"), so they gain their own places.
 *
 * Only the name travels, as the phone's geocoder names it ("Springfield,
 * Illinois, United States"): no position, no id. Kept as one app log line
 * for 30 days, read in batches from Cloud Logging (docs/car-api.md).
 *
 * Pure, so the rules are tested without a request.
 */
/**
 * The longest name taken. A geocoder's full name for a place ("Springfield,
 * Illinois, United States", "Coeur d'Alene, Idaho, United States") is well
 * under 80; anything longer is not a town, and a short cap keeps each log
 * line readable when the requests are read by hand (docs/car-api.md).
 * The shortest is 2: one character is not a place name.
 */
export const MAX_TOWN_REQUEST_CHARS = 80;
const MIN_TOWN_REQUEST_CHARS = 2;

/** A place name: letters in any script, digits, spaces and the punctuation names use. */
const NAME = /^[\p{L}\p{M}\p{N} .,'’()\-]+$/u;

export type TownRequestParse = { ok: true; name: string } | { ok: false; message: string };

/** The request body, strictly: a JSON object with one string `name`, trimmed, 2 to 80 characters of a place name. */
export function parseTownRequest(body: unknown): TownRequestParse {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, message: 'send a JSON object: { "name": "..." }' };
  const raw = (body as Record<string, unknown>).name;
  if (typeof raw !== "string") return { ok: false, message: "name must be a string" };
  // Only runs of spaces are tidied. A newline, tab or other control
  // character survives to the NAME check below, which refuses it: such a
  // character is never part of a place name.
  const name = raw.normalize("NFC").replace(/ +/g, " ").trim();
  if (name.length < MIN_TOWN_REQUEST_CHARS) return { ok: false, message: "name is too short" };
  if (name.length > MAX_TOWN_REQUEST_CHARS) return { ok: false, message: `name is longer than ${MAX_TOWN_REQUEST_CHARS} characters` };
  if (!NAME.test(name)) return { ok: false, message: "name may hold letters, digits, spaces and . , ' ( ) - only" };
  return { ok: true, name };
}
