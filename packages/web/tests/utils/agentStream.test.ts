import { describe, expect, it } from 'vitest';
import {
  AgentFrame,
  AgentSource,
  agentSessionId,
  agentTurnEvent,
  finalizeAgentAnswer,
  parseAgentFrames,
  renumberAgentCitations,
  toGroundingSourcesFromAgent,
} from '../../src/utils/agentStream';
import {
  IDLE_TURN_STATUS,
  TurnEvent,
  nextTurnStatus,
} from '../../src/utils/turnStatus';
import { parseSourceFootnotes } from '../../src/utils/grounding';

const sse = (frames: object[]) =>
  frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('');

const sources: AgentSource[] = [
  {
    marker: 'src-1',
    number: 1,
    title: 'Credit Policy.pdf',
    uri: 's3://mimir-docs/policies/Credit Policy.pdf',
    page: 7,
    score: 0.81,
    excerpt: 'Tenure caps are set per product.',
  },
  {
    marker: 'src-2',
    number: 2,
    title: 'Rate Card.pdf',
    uri: 's3://mimir-docs/rates/Rate Card.pdf',
    score: 0.62,
    excerpt: 'Effective from April.',
  },
];

describe('parseAgentFrames', () => {
  it('reads whole frames and keeps the partial tail', () => {
    const stream = sse([
      { type: 'tool', name: 'search_documents', status: 'running' },
      { type: 'delta', text: 'Tenure ' },
    ]);
    const split = stream.length - 12;

    const first = parseAgentFrames(stream.slice(0, split));
    expect(first.frames.map((f) => f.type)).toEqual(['tool']);

    const second = parseAgentFrames(first.rest + stream.slice(split));
    expect(second.frames).toEqual([{ type: 'delta', text: 'Tenure ' }]);
    expect(second.rest).toBe('');
  });

  it('ignores keep-alives, comments and anything that is not a frame', () => {
    const { frames } = parseAgentFrames(
      [':heartbeat', '', 'data: [DONE]', 'not json at all', ''].join('\n') +
        '\n'
    );

    expect(frames).toEqual([]);
  });

  it('accepts bare json lines as well as data-prefixed ones', () => {
    const { frames } = parseAgentFrames('{"type":"delta","text":"hi"}\n');

    expect(frames).toEqual([{ type: 'delta', text: 'hi' }]);
  });
});

describe('agentTurnEvent', () => {
  it('maps a tool run onto the searching and reading phases', () => {
    const running = agentTurnEvent({
      type: 'tool',
      name: 'search_documents',
      status: 'running',
    });
    expect(running).toEqual({ type: 'retrieve-start' });

    const succeeded = agentTurnEvent({
      type: 'tool',
      name: 'search_documents',
      status: 'succeeded',
      count: 3,
    });
    expect(succeeded).toEqual({ type: 'retrieve-settled', count: 3 });

    const status = [running!, succeeded!].reduce(
      nextTurnStatus,
      nextTurnStatus(IDLE_TURN_STATUS, { type: 'turn-start' })
    );
    expect(status).toEqual({ phase: 'reading', sourceCount: 3 });
  });

  it('says nothing rather than inventing a count', () => {
    const settled = agentTurnEvent({
      type: 'tool',
      name: 'search_documents',
      status: 'succeeded',
    });

    expect(settled).toEqual({ type: 'retrieve-settled', count: 0 });

    const status = [
      { type: 'turn-start' } as TurnEvent,
      { type: 'retrieve-start' } as TurnEvent,
      settled!,
    ].reduce(nextTurnStatus, IDLE_TURN_STATUS);
    expect(status.phase).toBe('waiting');
  });

  it('treats a failed search the same as a search with no hits', () => {
    expect(
      agentTurnEvent({
        type: 'tool',
        name: 'search_documents',
        status: 'failed',
      })
    ).toEqual({ type: 'retrieve-settled', count: 0 });
  });

  it('leaves the strip alone for every other frame', () => {
    const others: AgentFrame[] = [
      { type: 'delta', text: 'x' },
      { type: 'result', text: 'x' },
      { type: 'error', code: 'THROTTLING' },
    ];

    expect(others.map(agentTurnEvent)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe('toGroundingSourcesFromAgent', () => {
  it('rewrites s3 uris and keeps the page', () => {
    const [first, second] = toGroundingSourcesFromAgent(sources, 'ap-south-1');

    expect(first).toEqual({
      title: 'Credit Policy.pdf',
      uri: 'https://s3.ap-south-1.amazonaws.com/mimir-docs/policies/Credit Policy.pdf',
      page: 7,
      content: 'Tenure caps are set per product.',
    });
    expect(second.page).toBeUndefined();
  });

  it('falls back to the file name, then to a numbered label', () => {
    const [named, unnamed] = toGroundingSourcesFromAgent(
      [{ uri: 's3://docs/a%20b.pdf' }, {}],
      'ap-south-1'
    );

    expect(named.title).toBe('a b.pdf');
    expect(unnamed.title).toBe('Source 2');
  });
});

describe('renumberAgentCitations', () => {
  it('turns the agent one-based markers into array positions', () => {
    expect(
      renumberAgentCitations(
        'Caps apply.[^src-1] Rates changed.[^src-2]',
        sources
      )
    ).toBe('Caps apply.[^0] Rates changed.[^1]');
  });

  it('drops a marker that points at nothing', () => {
    expect(renumberAgentCitations('Unsupported.[^src-9]', sources)).toBe(
      'Unsupported.'
    );
  });
});

describe('finalizeAgentAnswer', () => {
  it('appends the footnote list in the shape the citation pills read back', () => {
    const answer = finalizeAgentAnswer(
      'Caps apply.[^src-1]',
      sources,
      'ap-south-1'
    );

    expect(answer).toBe(
      'Caps apply.[^src-0]\n\n[^src-0]: [Credit Policy.pdf (p.7)](https://s3.ap-south-1.amazonaws.com/mimir-docs/policies/Credit%20Policy.pdf#page=7)'
    );

    expect(parseSourceFootnotes(answer)).toEqual({
      'src-0': {
        label: 'Credit Policy.pdf (p.7)',
        href: 'https://s3.ap-south-1.amazonaws.com/mimir-docs/policies/Credit%20Policy.pdf#page=7',
      },
    });
  });

  it('only lists the sources the answer actually cited', () => {
    const answer = finalizeAgentAnswer(
      'Rates changed.[^src-2]',
      sources,
      'ap-south-1'
    );

    expect(answer).not.toContain('Credit Policy');
    expect(answer).toContain('[^src-1]: [Rate Card.pdf]');
  });

  it('leaves an uncited answer untouched', () => {
    expect(
      finalizeAgentAnswer('No documents cover this.', [], 'ap-south-1')
    ).toBe('No documents cover this.');
  });
});

describe('agentSessionId', () => {
  it('pads to the length AgentCore demands and stays stable', () => {
    const id = agentSessionId('chat#abc');

    expect(id.length).toBeGreaterThanOrEqual(33);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(agentSessionId('chat#abc')).toBe(id);
  });

  it('keeps a long seed intact rather than padding it', () => {
    const seed = '4c1a0f9e-4f1e-4c73-9d31-4a2f0b7c8e11';

    expect(agentSessionId(seed)).toBe(`mimir-${seed}`);
  });
});
