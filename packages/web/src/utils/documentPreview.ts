/**
 * Everything the citation preview panel needs to know about a document before
 * it has fetched a byte of it: what it is called, which page the citation
 * pointed at, and which renderer can show it.
 *
 * Pure, so the routing table and the CSV parser are unit tested without a DOM.
 */

export type PreviewKind =
  | 'pdf'
  | 'markdown'
  | 'csv'
  | 'text'
  | 'image'
  | 'unsupported';

/** Kinds whose bytes are fetched and parsed in the browser. */
export const TEXTUAL_PREVIEW_KINDS: PreviewKind[] = ['markdown', 'csv', 'text'];

const EXTENSION_KINDS: Record<string, PreviewKind> = {
  pdf: 'pdf',

  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',

  csv: 'csv',
  tsv: 'csv',

  txt: 'text',
  log: 'text',
  json: 'text',
  yaml: 'text',
  yml: 'text',

  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  bmp: 'image',
};

/** Drop the `#page=3` anchor a citation carries. */
export const stripAnchor = (href: string): string => href.split('#')[0];

/** The page a citation pointed at, when it had one. */
export const previewPage = (href: string): number | undefined => {
  const match = /#page=(\d+)/.exec(href);

  if (!match) {
    return undefined;
  }

  const page = Number(match[1]);

  return Number.isFinite(page) && page > 0 ? page : undefined;
};

/** The file name to show in the panel header. */
export const previewFileName = (href: string): string => {
  const last = stripAnchor(href).split('/').pop() ?? '';

  try {
    return decodeURIComponent(last) || href;
  } catch {
    return last || href;
  }
};

/** Which renderer handles this document. */
export const previewKind = (href: string): PreviewKind => {
  const name = previewFileName(href);
  const dot = name.lastIndexOf('.');

  if (dot < 0 || dot === name.length - 1) {
    return 'unsupported';
  }

  return EXTENSION_KINDS[name.slice(dot + 1).toLowerCase()] ?? 'unsupported';
};

/** Whether the panel has to download the file before it can render it. */
export const needsFetch = (kind: PreviewKind): boolean =>
  TEXTUAL_PREVIEW_KINDS.includes(kind);

// A preview is a glance, not a spreadsheet: past a couple of hundred rows the
// panel is a scroll trap and the browser starts to feel it
export const CSV_ROW_LIMIT = 200;

export type ParsedCsv = {
  headers: string[];
  rows: string[][];
  totalRows: number;
  truncated: boolean;
};

/**
 * Pick between comma and tab by looking at the first line only. A `.tsv` that
 * was renamed, or a CSV whose header happens to hold a tab, is rare enough that
 * a heuristic beats another dependency.
 */
const detectDelimiter = (text: string): string => {
  const [firstLine = ''] = text.split('\n');
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;

  return tabs > commas ? '\t' : ',';
};

/**
 * A deliberately small RFC-4180 reader: quoted fields, `""` escapes, and
 * newlines inside quotes. Everything else is treated as literal text, which is
 * the right call for a preview - a malformed row should still be visible.
 */
const parseRows = (text: string, delimiter: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char !== '"') {
        field += char;
      } else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = false;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
};

/** Split a CSV into a header row and a capped body. */
export const parseCsv = (text: string, limit = CSV_ROW_LIMIT): ParsedCsv => {
  // Excel writes a UTF-8 BOM; left in, it becomes part of the first header
  const trimmed = text.replace(/^\uFEFF/, '');

  if (trimmed.trim() === '') {
    return { headers: [], rows: [], totalRows: 0, truncated: false };
  }

  const [headers = [], ...body] = parseRows(trimmed, detectDelimiter(trimmed));

  return {
    headers,
    rows: body.slice(0, limit),
    totalRows: body.length,
    truncated: body.length > limit,
  };
};
