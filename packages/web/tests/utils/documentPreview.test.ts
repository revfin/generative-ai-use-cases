import { describe, expect, it } from 'vitest';
import {
  CSV_ROW_LIMIT,
  needsFetch,
  parseCsv,
  previewFileName,
  previewKind,
  previewPage,
  stripAnchor,
} from '../../src/utils/documentPreview';
import { parseSourceFootnotes } from '../../src/utils/grounding';

const s3 = (name: string) =>
  `https://s3.ap-south-1.amazonaws.com/mimir-docs/${name}`;

describe('preview routing', () => {
  it('routes each extension to its renderer', () => {
    expect(previewKind(s3('loan-policy.pdf'))).toBe('pdf');
    expect(previewKind(s3('README.md'))).toBe('markdown');
    expect(previewKind(s3('tenure.csv'))).toBe('csv');
    expect(previewKind(s3('rates.tsv'))).toBe('csv');
    expect(previewKind(s3('notes.txt'))).toBe('text');
    expect(previewKind(s3('config.yaml'))).toBe('text');
    expect(previewKind(s3('diagram.PNG'))).toBe('image');
    expect(previewKind(s3('deck.pptx'))).toBe('unsupported');
    expect(previewKind(s3('LICENSE'))).toBe('unsupported');
    expect(previewKind(s3('trailing.'))).toBe('unsupported');
  });

  it('ignores the page anchor when deciding what to render', () => {
    expect(previewKind(`${s3('loan-policy.pdf')}#page=12`)).toBe('pdf');
    expect(stripAnchor(`${s3('loan-policy.pdf')}#page=12`)).toBe(
      s3('loan-policy.pdf')
    );
  });

  it('only fetches the formats it has to parse', () => {
    expect(needsFetch('markdown')).toBe(true);
    expect(needsFetch('csv')).toBe(true);
    expect(needsFetch('text')).toBe(true);
    expect(needsFetch('pdf')).toBe(false);
    expect(needsFetch('image')).toBe(false);
    expect(needsFetch('unsupported')).toBe(false);
  });

  it('reads the file name and page out of a citation href', () => {
    expect(previewFileName(`${s3('loan%20policy.pdf')}#page=3`)).toBe(
      'loan policy.pdf'
    );
    expect(previewPage(`${s3('loan-policy.pdf')}#page=3`)).toBe(3);
    expect(previewPage(s3('loan-policy.pdf'))).toBeUndefined();
    expect(previewPage(`${s3('loan-policy.pdf')}#page=0`)).toBeUndefined();
  });

  it('turns a rendered footnote list back into preview targets', () => {
    const answer = [
      'Fees are capped.[^src-0]',
      '',
      `[^src-0]: [loan-policy.pdf (p.3)](${s3('loan-policy.pdf')}#page=3)`,
      '[^src-1]: orphan-source-without-a-uri.pdf',
    ].join('\n');

    expect(parseSourceFootnotes(answer)).toEqual({
      'src-0': {
        label: 'loan-policy.pdf (p.3)',
        href: `${s3('loan-policy.pdf')}#page=3`,
      },
    });
  });

  it('unescapes labels that had brackets in the file name', () => {
    const answer = `[^src-0]: [report\\[final\\].pdf](${s3('report.pdf')})`;

    expect(parseSourceFootnotes(answer)['src-0'].label).toBe(
      'report[final].pdf'
    );
  });
});

describe('csv parser', () => {
  it('splits a plain table', () => {
    const table = parseCsv('name,tenure\nEV loan,36\nBike loan,24\n');

    expect(table.headers).toEqual(['name', 'tenure']);
    expect(table.rows).toEqual([
      ['EV loan', '36'],
      ['Bike loan', '24'],
    ]);
    expect(table.totalRows).toBe(2);
    expect(table.truncated).toBe(false);
  });

  it('keeps quoted commas, escaped quotes and embedded newlines together', () => {
    const table = parseCsv(
      'name,note\n"Loan, EV","He said ""yes"""\n"Multi\nline",plain\n'
    );

    expect(table.rows).toEqual([
      ['Loan, EV', 'He said "yes"'],
      ['Multi\nline', 'plain'],
    ]);
  });

  it('survives CRLF, a BOM and a missing trailing newline', () => {
    const table = parseCsv('﻿a,b\r\n1,2\r\n3,4');

    expect(table.headers).toEqual(['a', 'b']);
    expect(table.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('keeps ragged rows rather than dropping them', () => {
    const table = parseCsv('a,b,c\n1,2\n');

    expect(table.rows).toEqual([['1', '2']]);
  });

  it('caps the body and reports the real total', () => {
    const rows = Array.from({ length: 250 }, (_row, i) => `${i},x`).join('\n');
    const table = parseCsv(`id,value\n${rows}\n`);

    expect(table.rows).toHaveLength(CSV_ROW_LIMIT);
    expect(table.totalRows).toBe(250);
    expect(table.truncated).toBe(true);
  });

  it('falls back to tabs when the header says so', () => {
    const table = parseCsv('name\ttenure\nEV loan\t36\n');

    expect(table.headers).toEqual(['name', 'tenure']);
    expect(table.rows).toEqual([['EV loan', '36']]);
  });

  it('returns an empty table for empty input', () => {
    expect(parseCsv('   \n')).toEqual({
      headers: [],
      rows: [],
      totalRows: 0,
      truncated: false,
    });
  });
});
