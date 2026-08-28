import { describe, expect, it } from 'vitest';
import {
  MAX_RETRIEVAL_QUERY_LENGTH,
  appendSourceFootnotes,
  buildGroundedSystemContext,
  buildRetrievalQuery,
  convertS3UriToUrl,
  stripSourceFootnotes,
  toGroundingSources,
  type GroundingSource,
} from '../../src/utils/grounding';

const chunk = (text: string, uri: string, page?: number) => ({
  content: { text },
  metadata: {
    'x-amz-bedrock-kb-source-uri': uri,
    ...(page === undefined
      ? {}
      : { 'x-amz-bedrock-kb-document-page-number': page }),
  },
});

describe('convertS3UriToUrl', () => {
  it('rewrites an s3 uri to an https url', () => {
    expect(
      convertS3UriToUrl('s3://docs/policies/leave.pdf', 'ap-south-1')
    ).toBe('https://s3.ap-south-1.amazonaws.com/docs/policies/leave.pdf');
  });

  it('leaves other uris untouched', () => {
    expect(convertS3UriToUrl('https://example.com/a.pdf', 'ap-south-1')).toBe(
      'https://example.com/a.pdf'
    );
  });
});

describe('buildRetrievalQuery', () => {
  it('uses the question on its own when it stands alone', () => {
    const question =
      'What is the notice period for a permanent employee in India?';
    expect(buildRetrievalQuery(question, 'unrelated earlier turn')).toBe(
      question
    );
  });

  it('anchors a short follow-up on the previous question', () => {
    expect(buildRetrievalQuery('and the penalty?', 'What is clause 7?')).toBe(
      'What is clause 7?\nand the penalty?'
    );
  });

  it('truncates to the Retrieve API limit', () => {
    expect(buildRetrievalQuery('x'.repeat(5000)).length).toBe(
      MAX_RETRIEVAL_QUERY_LENGTH
    );
  });
});

describe('toGroundingSources', () => {
  it('merges chunks from the same document and page', () => {
    const sources = toGroundingSources(
      [
        chunk('first half', 's3://docs/handbook.pdf', 3),
        chunk('second half', 's3://docs/handbook.pdf', 3),
        chunk('other page', 's3://docs/handbook.pdf', 4),
      ],
      'ap-south-1'
    );

    expect(sources).toHaveLength(2);
    expect(sources[0].content).toBe('first half … second half');
    expect(sources[0].title).toBe('handbook.pdf');
    expect(sources[0].uri).toBe(
      'https://s3.ap-south-1.amazonaws.com/docs/handbook.pdf'
    );
    expect(sources[1].page).toBe(4);
  });

  it('drops empty chunks and handles no results', () => {
    expect(toGroundingSources([{ content: { text: '  ' } }], 'x')).toEqual([]);
    expect(toGroundingSources(undefined, 'x')).toEqual([]);
  });
});

describe('buildGroundedSystemContext', () => {
  const base = 'You are an assistant.';

  it('returns the base context when nothing was retrieved', () => {
    expect(buildGroundedSystemContext(base, [])).toBe(base);
  });

  it('injects the passages with citable source ids', () => {
    const context = buildGroundedSystemContext(base, [
      { title: 'handbook.pdf', uri: 'https://x/handbook.pdf', content: 'text' },
    ]);

    expect(context.startsWith(base)).toBe(true);
    expect(context).toContain('"SourceId":0');
    expect(context).toContain('<documents>');
  });
});

describe('appendSourceFootnotes', () => {
  const sources: GroundingSource[] = [
    {
      title: 'handbook.pdf',
      uri: 'https://s3.ap-south-1.amazonaws.com/docs/handbook.pdf',
      page: 3,
      content: 'text',
    },
    { title: 'policy.pdf', uri: 'https://x/policy.pdf', content: 'text' },
  ];

  it('adds a footnote only for the cited source', () => {
    const answer = appendSourceFootnotes('Thirty days.[^0]', sources);

    expect(answer).toContain('Thirty days.[^src-0]');
    expect(answer).toContain(
      '[^src-0]: [handbook.pdf (p.3)](https://s3.ap-south-1.amazonaws.com/docs/handbook.pdf#page=3)'
    );
    expect(answer).not.toContain('[^src-1]:');
  });

  it('drops markers that point at nothing', () => {
    expect(appendSourceFootnotes('Invented.[^7]', sources)).toBe('Invented.');
  });

  it('leaves an ungrounded answer alone', () => {
    expect(appendSourceFootnotes('Plain answer.', [])).toBe('Plain answer.');
  });

  it('discards the footnote definitions the model wrote itself', () => {
    // GFM keeps the first definition per label, so a model-written block would
    // otherwise shadow ours and render as a bare backref arrow
    const answer = appendSourceFootnotes(
      [
        'Thirty days.[^0] Two weeks.[^1]',
        '',
        '[^0]:',
        '[^1]: Handbook',
        '    continued on the next line',
      ].join('\n'),
      sources
    );

    expect(answer).not.toContain('[^0]:');
    expect(answer).not.toContain('[^1]: Handbook');
    expect(answer).not.toContain('continued on the next line');
    expect(answer).toContain(
      '[^src-0]: [handbook.pdf (p.3)](https://s3.ap-south-1.amazonaws.com/docs/handbook.pdf#page=3)'
    );
    expect(answer).toContain('[^src-1]: [policy.pdf](https://x/policy.pdf)');
  });

  it('keeps every definition on its own line at the end of the answer', () => {
    const answer = appendSourceFootnotes('A.[^0] B.[^1]', sources);
    const [body, blank, ...definitions] = answer.split('\n');

    expect(body).toBe('A.[^src-0] B.[^src-1]');
    expect(blank).toBe('');
    expect(definitions).toHaveLength(2);
    expect(definitions.every((line) => /^\[\^src-\d+\]: /.test(line))).toBe(
      true
    );
  });

  it('falls back to a visible label when the metadata carries no title', () => {
    const answer = appendSourceFootnotes('Cited.[^0]', [
      { title: '', uri: '', content: 'text' },
    ]);

    expect(answer).toContain('[^src-0]: Source 1');
  });

  it('escapes brackets so an awkward filename stays a footnote', () => {
    const answer = appendSourceFootnotes('Cited.[^0]', [
      { title: 'report[final].pdf', uri: 'https://x/r.pdf', content: 'text' },
    ]);

    expect(answer).toContain(
      '[^src-0]: [report\\[final\\].pdf](https://x/r.pdf)'
    );
  });
});

describe('stripSourceFootnotes', () => {
  it('removes markers and definitions from replayed answers', () => {
    const [message] = stripSourceFootnotes([
      {
        role: 'assistant',
        content: 'Thirty days.[^0]\n\n[^0]: [handbook.pdf](https://x)',
      },
    ]);

    expect(message.content).toBe('Thirty days.');
    expect(message.role).toBe('assistant');
  });

  it('removes the namespaced citations this app writes', () => {
    const [message] = stripSourceFootnotes([
      {
        role: 'assistant',
        content:
          'Thirty days.[^src-0]\n\n[^src-0]: [handbook.pdf (p.3)](https://x#page=3)',
      },
    ]);

    expect(message.content).toBe('Thirty days.');
  });

  it('leaves the system context alone, markers and all', () => {
    const systemContext = 'Cite with a [^SourceId] marker (for example [^0]).';
    const [message] = stripSourceFootnotes([
      { role: 'system', content: systemContext },
    ]);

    expect(message.content).toBe(systemContext);
  });
});
