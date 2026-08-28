import { createContext, useContext } from 'react';
import { CitationTarget } from '../utils/grounding';

/**
 * The footnote list of the message currently being rendered, keyed by footnote
 * label (`src-0`, `src-1`, ...).
 *
 * Inline citation pills render as links to a footnote anchor, so the link
 * renderer has no way of knowing which document a pill stands for. Rather than
 * threading a prop through react-markdown's component map, the message that
 * owns the footnotes publishes them here.
 */
export const CitationContext = createContext<Record<string, CitationTarget>>(
  {}
);

export const useCitations = () => useContext(CitationContext);

/** Stable empty map, so messages without citations never re-render consumers. */
export const NO_CITATIONS: Record<string, CitationTarget> = {};
