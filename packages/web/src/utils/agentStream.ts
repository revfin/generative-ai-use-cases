import {
  GroundingSource,
  appendSourceFootnotes,
  convertS3UriToUrl,
  fileNameOf,
} from './grounding';
import { TurnEvent } from './turnStatus';

/**
 * The Mimir agent's wire format, read back.
 *
 * The runtime answers `InvokeAgentRuntime` with an SSE stream of JSON frames:
 * `tool` frames while it searches, a long run of `delta` frames carrying the
 * answer, and one terminal `result` frame holding the finished text and the
 * sources it cited. Failures arrive as an `error` frame rather than a dead
 * socket.
 *
 * Everything in this file is pure, so the mapping from those frames to what
 * the chat shows is unit tested without a network or a browser.
 */

export type AgentToolFrame = {
  type: 'tool';
  name?: string;
  status?: 'running' | 'succeeded' | 'failed';
  // The runtime does not promise a result count on the tool frame. When it
  // sends one the strip can say "Reading N sources"; when it does not, the
  // strip stays quiet rather than inventing a number.
  count?: number;
  resultCount?: number;
  result_count?: number;
};

export type AgentDeltaFrame = {
  type: 'delta';
  text?: string;
};

/** One citable passage as the agent reports it. Markers are 1-based. */
export type AgentSource = {
  marker?: string;
  number?: number;
  title?: string;
  uri?: string;
  page?: number | string;
  score?: number;
  excerpt?: string;
};

export type AgentResultFrame = {
  type: 'result';
  text?: string;
  sessionId?: string;
  sources?: AgentSource[];
};

export type AgentErrorFrame = {
  type: 'error';
  code?: string;
  message?: string;
};

export type AgentFrame =
  | AgentToolFrame
  | AgentDeltaFrame
  | AgentResultFrame
  | AgentErrorFrame
  | { type: string };

/**
 * Split a growing buffer into whole SSE frames.
 *
 * Only complete lines are parsed; the trailing partial line is handed back as
 * `rest` for the next chunk to finish. A line that is not JSON is dropped
 * rather than thrown - a frame we cannot read is not a frame.
 */
export const parseAgentFrames = (
  buffer: string
): { frames: AgentFrame[]; rest: string } => {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const frames: AgentFrame[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Blank separators and SSE comments carry nothing
    if (line === '' || line.startsWith(':')) {
      continue;
    }

    const body = line.startsWith('data:') ? line.slice(5).trim() : line;

    if (body === '' || body === '[DONE]') {
      continue;
    }

    try {
      const frame = JSON.parse(body);

      if (
        frame &&
        typeof frame === 'object' &&
        typeof frame.type === 'string'
      ) {
        frames.push(frame as AgentFrame);
      }
    } catch {
      // Not JSON: a keep-alive or a log line that reached the wire
    }
  }

  return { frames, rest };
};

const toolResultCount = (frame: AgentToolFrame): number => {
  const count = frame.count ?? frame.resultCount ?? frame.result_count;

  return typeof count === 'number' && Number.isFinite(count) && count > 0
    ? count
    : 0;
};

/**
 * What a frame means to the status strip.
 *
 * Only tool frames move it: the answer phases are already driven by the
 * assistant message filling up, exactly as on the non-agent path.
 */
export const agentTurnEvent = (frame: AgentFrame): TurnEvent | undefined => {
  if (frame.type !== 'tool') {
    return undefined;
  }

  const tool = frame as AgentToolFrame;

  switch (tool.status) {
    case 'running':
      return { type: 'retrieve-start' };
    case 'succeeded':
      return { type: 'retrieve-settled', count: toolResultCount(tool) };
    case 'failed':
      // A failed search is not an error the user needs to see: the agent
      // answers without it, the same way a zero-hit retrieval does
      return { type: 'retrieve-settled', count: 0 };
    default:
      return undefined;
  }
};

const toPage = (page: number | string | undefined): number | undefined => {
  if (page === undefined || page === null || page === '') {
    return undefined;
  }

  const parsed = Number(page);

  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Fold the agent's sources into the shape the citation pills and the preview
 * panel already understand, so both keep working untouched.
 */
export const toGroundingSourcesFromAgent = (
  sources: AgentSource[] | undefined,
  modelRegion: string
): GroundingSource[] =>
  (sources ?? []).map((source, idx) => {
    const uri = source.uri ?? '';

    return {
      title: source.title?.trim() || fileNameOf(uri) || `Source ${idx + 1}`,
      uri: uri.startsWith('s3://') ? convertS3UriToUrl(uri, modelRegion) : uri,
      page: toPage(source.page),
      content: source.excerpt ?? '',
    };
  });

// Any footnote-shaped marker the agent wrote: `[^src-1]`, `[^1]`, `[^doc_a]`
const AGENT_MARKER = /\[\^([A-Za-z0-9_-]+)\]/g;

/**
 * Rewrite the agent's markers to the positional ones `appendSourceFootnotes`
 * expects.
 *
 * The agent numbers its sources from one (`src-1`) while the footnote writer
 * indexes the array it is given, so the two disagree by one. Renumbering here
 * - rather than teaching the footnote writer a second convention - keeps a
 * single citation format in the recorded history. Markers with no matching
 * source are dropped so the answer never shows a dangling reference.
 */
export const renumberAgentCitations = (
  text: string,
  sources: AgentSource[] | undefined
): string => {
  const positions = new Map<string, number>();

  (sources ?? []).forEach((source, idx) => {
    if (source.marker) {
      positions.set(source.marker, idx);
    }
    if (source.number !== undefined && source.number !== null) {
      positions.set(String(source.number), idx);
    }
  });

  return text.replace(AGENT_MARKER, (_marker, label: string) => {
    const position =
      positions.get(label) ?? positions.get(label.replace(/^src-/, ''));

    return position === undefined ? '' : `[^${position}]`;
  });
};

/**
 * The finished answer, with the footnote list appended in the app's existing
 * format. This is what is rendered and what is written to the chat history,
 * so a reloaded conversation shows the same citations it did live.
 */
export const finalizeAgentAnswer = (
  text: string,
  sources: AgentSource[] | undefined,
  modelRegion: string
): string =>
  appendSourceFootnotes(
    renumberAgentCitations(text, sources),
    toGroundingSourcesFromAgent(sources, modelRegion)
  );

// AgentCore rejects a runtime session id shorter than 33 characters and only
// accepts this alphabet
const SESSION_ID_MIN_LENGTH = 33;
const SESSION_ID_MAX_LENGTH = 100;

/**
 * A stable runtime session id for one conversation.
 *
 * Derived, not random, so every turn of the same chat lands on the same
 * session - which is what session memory will key on once it is switched on.
 */
export const agentSessionId = (seed: string): string => {
  const safe = `mimir-${seed}`
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .slice(0, SESSION_ID_MAX_LENGTH);

  return safe.length >= SESSION_ID_MIN_LENGTH
    ? safe
    : safe.padEnd(SESSION_ID_MIN_LENGTH, '0');
};
