import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DocumentPreviewPanel from '../../src/components/DocumentPreviewPanel';
import useDocumentPreview from '../../src/hooks/useDocumentPreview';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// The panel only needs the presign path; the rest of useRagFile is irrelevant
const resolveDocUrl = vi.fn(async (href: string) => `signed://${href}`);

vi.mock('../../src/hooks/useRagFile', () => ({
  default: () => ({ resolveDocUrl }),
  __esModule: true,
}));

// Markdown drags in katex, prism and the lazy chart renderers; the panel test
// only cares that document text reaches it
vi.mock('../../src/components/Markdown', () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
  ),
  __esModule: true,
}));

const s3 = (name: string) =>
  `https://s3.ap-south-1.amazonaws.com/mimir-docs/${name}`;

const open = (href: string, label: string, page?: number) =>
  act(() => {
    useDocumentPreview.getState().openPreview({ href, label, page });
  });

const fetchText = (body: string) =>
  vi.fn(async () => ({ ok: true, text: async () => body }));

beforeEach(() => {
  useDocumentPreview.setState({ doc: null, hosts: 0 });
  resolveDocUrl.mockClear();
  vi.stubGlobal('fetch', fetchText(''));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DocumentPreviewPanel', () => {
  it('renders nothing until a citation is clicked', () => {
    render(<DocumentPreviewPanel />);

    expect(screen.queryByRole('dialog')).toBeNull();
    // The panel still registers itself, so citations know to open it
    expect(useDocumentPreview.getState().hosts).toBe(1);
  });

  it('embeds a pdf at the cited page', async () => {
    render(<DocumentPreviewPanel />);
    open(`${s3('loan-policy.pdf')}#page=3`, 'loan-policy.pdf', 3);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('loan-policy.pdf');
    expect(screen.getByText('chat.preview_page')).toBeInTheDocument();

    await waitFor(() => {
      expect(document.querySelector('iframe')?.getAttribute('src')).toBe(
        `signed://${s3('loan-policy.pdf')}#page=3`
      );
    });

    // Nothing is downloaded for an embedded viewer
    expect(fetch).not.toHaveBeenCalled();
  });

  it('swaps content in place when another citation is clicked', async () => {
    vi.stubGlobal('fetch', fetchText('name,tenure\nEV loan,36\n'));
    render(<DocumentPreviewPanel />);

    open(`${s3('loan-policy.pdf')}#page=3`, 'loan-policy.pdf', 3);
    await waitFor(() => expect(document.querySelector('iframe')).toBeTruthy());

    open(s3('tenure.csv'), 'tenure.csv');

    await waitFor(() =>
      expect(screen.getByText('EV loan')).toBeInTheDocument()
    );
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.queryByText('chat.preview_page')).toBeNull();
    // Signed URLs are short lived, so each open re-resolves
    expect(resolveDocUrl).toHaveBeenCalledTimes(2);
  });

  it('renders a csv as a capped table', async () => {
    const rows = Array.from({ length: 250 }, (_row, i) => `${i},x`).join('\n');
    vi.stubGlobal('fetch', fetchText(`id,value\n${rows}\n`));
    render(<DocumentPreviewPanel />);

    open(s3('rates.csv'), 'rates.csv');

    await waitFor(() =>
      expect(screen.getByText('chat.preview_csv_truncated')).toBeInTheDocument()
    );
    expect(document.querySelectorAll('tbody tr')).toHaveLength(200);
  });

  it('offers a new tab when the format has no preview', async () => {
    render(<DocumentPreviewPanel />);
    open(s3('deck.pptx'), 'deck.pptx');

    await waitFor(() =>
      expect(screen.getByText('chat.preview_unavailable')).toBeInTheDocument()
    );
    // The card offers its own escape hatch on top of the header icon
    expect(
      screen.getAllByRole('button', { name: 'chat.preview_open_new_tab' })
    ).toHaveLength(2);
  });

  it('falls back to the unavailable card when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 403 }))
    );
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<DocumentPreviewPanel />);

    open(s3('notes.txt'), 'notes.txt');

    await waitFor(() =>
      expect(screen.getByText('chat.preview_unavailable')).toBeInTheDocument()
    );
    error.mockRestore();
  });

  it('closes on the × button and on Escape', async () => {
    render(<DocumentPreviewPanel />);

    open(s3('loan-policy.pdf'), 'loan-policy.pdf');
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByTitle('common.close'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    open(s3('loan-policy.pdf'), 'loan-policy.pdf');
    await screen.findByRole('dialog');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('drops the open document when the page unmounts', async () => {
    const { unmount } = render(<DocumentPreviewPanel />);

    open(s3('loan-policy.pdf'), 'loan-policy.pdf');
    await screen.findByRole('dialog');

    unmount();

    expect(useDocumentPreview.getState().hosts).toBe(0);
    expect(useDocumentPreview.getState().doc).toBeNull();
  });
});
