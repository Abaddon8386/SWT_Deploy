import { useSourceLanguage, sourceText } from "../../shop/shopI18n";
import type { CSSProperties } from 'react';

export function SplitHeading({ id, lines }: { id: string; lines: string[] }) {
  useSourceLanguage();
  let wordIndex = 0;
  return (
    <h2 id={id} className="fit-split-heading">
      {lines.map((line, lineIdx) => {
        const words = sourceText(line).split(' ');
        return (
          <span key={lineIdx} className="fit-heading-line">
            {words.map((word, idx) => {
              const currentIdx = wordIndex++;
              const isLastWord = lineIdx === lines.length - 1 && idx === words.length - 1;
              return (
                <span key={`${lineIdx}-${idx}`}>
                  <span className="fit-word">
                    <span style={{ '--word-index': currentIdx } as CSSProperties}>
                      {word}
                      {isLastWord && <span className="fit-title-dot">.</span>}
                    </span>
                  </span>
                  {idx < words.length - 1 ? ' ' : ''}
                </span>
              );
            })}
            {lineIdx < lines.length - 1 && <br />}
          </span>
        );
      })}
    </h2>
  );
}
