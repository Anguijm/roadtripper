import React from "react";

/**
 * A sentence with its figures in the mono face and its words in the body
 * face (quality bar, rule 2: the monospace face is for numbers and codes
 * only). "7 h 40 min on the road" sets 7 and 40 in `.num` and "h", "min"
 * and the rest in sans; set whole in `.num`, the units came out
 * wide-spaced inside a sans sentence (Gauntlet U3, round 1). Pure: the
 * digit runs of the text, nothing else, so a town with a number in its
 * name gets that number in mono, which is the rule.
 */
export default function Figures({ text }: { text: string }) {
  // A capturing split puts every figure at an odd index; the empty strings
  // a leading or trailing one leaves render as nothing. A figure followed
  // by its unit ("6 h", "45 min", "494 mi") is kept on one line (Gauntlet
  // U28, critic: "Chicago to 45 min past Elizabethtown · 6" ended a line
  // with "h" alone on the next); the digits still set in mono, the unit in
  // the body face.
  const parts = text.split(/((?:· )?\d+ (?:h|min|mi)\b|\d+)/);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        // The separator before a figure travels with it ("· 6 h"), so no
        // line ends on a dangling "·" (U28, round 2).
        const unit = /^((?:· )?)(\d+) (h|min|mi)$/.exec(part);
        if (!unit) {
          return (
            <span key={i} className="num">
              {part}
            </span>
          );
        }
        return (
          <span key={i} className="whitespace-nowrap">
            {unit[1]}
            <span className="num">{unit[2]}</span> {unit[3]}
          </span>
        );
      })}
    </>
  );
}
