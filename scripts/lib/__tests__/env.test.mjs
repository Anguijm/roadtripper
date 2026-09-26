import { describe, it, expect } from "vitest";
import { parseEnvText } from "../env.mjs";

describe("parseEnvText", () => {
  it("reads a plain value", () => {
    expect(parseEnvText("KEY=abc")).toEqual({ KEY: "abc" });
  });
  it("strips an inline comment from an unquoted value", () => {
    expect(parseEnvText("KEY=abc # note")).toEqual({ KEY: "abc" });
  });
  it("unquotes a quoted value", () => {
    expect(parseEnvText('KEY="abc"')).toEqual({ KEY: "abc" });
    expect(parseEnvText("KEY='a b'")).toEqual({ KEY: "a b" });
  });
  it("unquotes a quoted value that has a trailing comment (the round-6 bug)", () => {
    expect(parseEnvText('KEY="abc" # note')).toEqual({ KEY: "abc" });
  });
  it("keeps a # that is not preceded by whitespace", () => {
    expect(parseEnvText("KEY=abc#def")).toEqual({ KEY: "abc#def" });
  });
  it("keeps a # inside quotes", () => {
    expect(parseEnvText('KEY="a # b"')).toEqual({ KEY: "a # b" });
  });
  it("skips comment lines and blank lines", () => {
    expect(parseEnvText("# top\n\nKEY=1\n  # indented\n")).toEqual({ KEY: "1" });
  });
  it("allows an empty value", () => {
    expect(parseEnvText("KEY=")).toEqual({ KEY: "" });
  });
  it("treats an unterminated quote as unquoted", () => {
    expect(parseEnvText('KEY="oops')).toEqual({ KEY: '"oops' });
  });
  it("takes the first = as the separator", () => {
    expect(parseEnvText("KEY=a=b")).toEqual({ KEY: "a=b" });
  });
});
