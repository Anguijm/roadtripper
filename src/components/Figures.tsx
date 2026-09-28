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
  // A capturing split puts every digit run at an odd index; the empty
  // strings a leading or trailing run leaves render as nothing.
  const parts = text.split(/(\d+)/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="num">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}
