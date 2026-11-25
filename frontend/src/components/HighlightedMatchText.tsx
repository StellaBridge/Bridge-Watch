import { highlightSegments } from "../utils/fuzzySearch";

interface HighlightedMatchTextProps {
  text: string;
  /** The search text whose exact token matches are marked in `text`. */
  query: string;
  className?: string;
}

/** Renders `text` with the characters matched by `query` wrapped in <mark>. */
export default function HighlightedMatchText({ text, query, className }: HighlightedMatchTextProps) {
  const segments = highlightSegments(text, query);
  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.matched ? (
          <mark key={index} className="rounded-sm bg-stellar-blue/30 text-inherit">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </span>
  );
}
