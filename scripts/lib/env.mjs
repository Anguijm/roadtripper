import { readFileSync } from "node:fs";

/**
 * A small dotenv reader for the build scripts. Its own module for the same
 * reason dedupe is: the inline version in build-drive-graph.mjs shipped two
 * bugs in two council rounds, and neither could be tested where it lived.
 *
 * Rules, the ones that matter for an API key:
 *   - blank lines and lines whose first non-space character is # are skipped
 *   - the key is everything before the first =, trimmed
 *   - a value starting with " or ' runs to the NEXT matching quote; anything
 *     after that closing quote (a trailing comment) is ignored
 *   - an unquoted value ends at the first whitespace followed by #
 *   - a # with no whitespace before it is part of the value
 *
 * The order matters. An earlier version unquoted first and stripped comments
 * second, so `KEY="abc" # note` kept its quotes and every request 403'd.
 */
export function parseEnvText(text) {
  const out = {};
  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    if (!key) continue;
    let v = line.slice(i + 1).trim();
    const q = v[0];
    if (q === '"' || q === "'") {
      const close = v.indexOf(q, 1);
      if (close !== -1) { out[key] = v.slice(1, close); continue; }
      // No closing quote: fall through and treat it as unquoted.
    }
    out[key] = v.replace(/\s+#.*$/, "").trim();
  }
  return out;
}

/** File values first, then process.env on top, so an exported variable wins. */
export function loadEnv(path = ".env.local") {
  let text = "";
  try { text = readFileSync(path, "utf8"); } catch { /* absent is fine */ }
  return { ...parseEnvText(text), ...process.env };
}
