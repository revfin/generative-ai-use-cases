import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Markdown from '../../src/components/Markdown';
import {
  appendSourceFootnotes,
  type GroundingSource,
} from '../../src/utils/grounding';

// The link renderer reaches for the file API to sign S3 downloads. Nothing here
// clicks a citation, so a stub keeps the render offline.
vi.mock('../../src/hooks/useFileApi', () => ({
  default: () => ({ getFileDownloadSignedUrl: vi.fn() }),
}));

const sources: GroundingSource[] = [
  {
    title: 'loan-policy.pdf',
    uri: 'https://s3.ap-south-1.amazonaws.com/mimir-docs/loan-policy.pdf',
    page: 3,
    content: 'text',
  },
  {
    title: 'loan-policy.pdf',
    uri: 'https://s3.ap-south-1.amazonaws.com/mimir-docs/loan-policy.pdf',
    page: 7,
    content: 'text',
  },
  {
    title: 'tenure-matrix.pdf',
    uri: 'https://s3.ap-south-1.amazonaws.com/mimir-docs/tenure-matrix.pdf',
    page: 1,
    content: 'text',
  },
];

const renderAnswer = (answer: string) =>
  render(
    <MemoryRouter>
      <Markdown prefix="0">{appendSourceFootnotes(answer, sources)}</Markdown>
    </MemoryRouter>
  ).container;

const footnoteItems = (container: HTMLElement) => [
  ...container.querySelectorAll('section.footnotes ol > li'),
];

describe('Markdown footnotes', () => {
  it('renders one visible source per citation', () => {
    const container = renderAnswer(
      'Fees are capped at 2%.[^0] A penalty applies after 30 days.[^1] The tenure is 36 months.[^2]'
    );

    const items = footnoteItems(container);
    expect(items).toHaveLength(3);
    expect(items.map((li) => li.textContent?.replace(/↩/g, '').trim())).toEqual(
      [
        'loan-policy.pdf (p.3)',
        'loan-policy.pdf (p.7)',
        'tenure-matrix.pdf (p.1)',
      ]
    );

    // Every entry is a link to its own source, not a naked backref arrow
    for (const li of items) {
      const [source] = [...li.querySelectorAll('a')].filter(
        (a) => !a.getAttribute('href')?.startsWith('#')
      );
      expect(source?.textContent).toMatch(/\.pdf \(p\.\d\)$/);
    }
  });

  it('survives the model writing its own footnote definitions', () => {
    // The reported bug: GFM keeps the first definition per label, so the empty
    // block the model wrote won and every entry collapsed to a backref arrow
    const container = renderAnswer(
      [
        'Fees are capped at 2%.[^0] A penalty applies.[^1] Tenure is 36 months.[^2]',
        '',
        '[^0]:',
        '[^1]:',
        '[^2]:',
      ].join('\n')
    );

    expect(
      footnoteItems(container).map((li) =>
        li.textContent?.replace(/↩/g, '').trim()
      )
    ).toEqual([
      'loan-policy.pdf (p.3)',
      'loan-policy.pdf (p.7)',
      'tenure-matrix.pdf (p.1)',
    ]);
  });

  it('keeps the inline citation pills', () => {
    const container = renderAnswer('Fees are capped at 2%.[^0] Tenure.[^2]');

    const pills = [...container.querySelectorAll('p sup')];
    expect(pills.map((pill) => pill.textContent)).toEqual(['1', '2']);
    expect(pills[0].className).toContain('rounded');
  });
});
