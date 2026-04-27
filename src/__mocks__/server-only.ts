// Shim for vitest: server-only has no exports; it only throws in non-server
// contexts. Tests run in Node so the guard is irrelevant — replace with a no-op.
export {};
