import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { PiArrowSquareOut, PiX } from 'react-icons/pi';
import Markdown from './Markdown';
import ButtonIcon from './ButtonIcon';
import useDocumentPreview from '../hooks/useDocumentPreview';
import useRagFile from '../hooks/useRagFile';
import {
  CSV_ROW_LIMIT,
  needsFetch,
  parseCsv,
  previewKind,
} from '../utils/documentPreview';

// A preview is a glance. Past half a megabyte of text the panel is a scroll
// trap, and the file is better opened in its own tab.
const MAX_TEXT_LENGTH = 500_000;

type Fetched =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string; text?: string }
  | { status: 'error'; url?: string };

/**
 * The right-hand citation preview.
 *
 * One instance per page: the panel subscribes to the shared preview store, so
 * clicking a different citation swaps the content in place instead of stacking
 * panels. Presigned URLs live about a minute, so every open re-resolves rather
 * than reusing whatever was signed last time.
 */
const DocumentPreviewPanel: React.FC = () => {
  const { t } = useTranslation();
  const doc = useDocumentPreview((state) => state.doc);
  const closePreview = useDocumentPreview((state) => state.closePreview);
  const addHost = useDocumentPreview((state) => state.addHost);
  const removeHost = useDocumentPreview((state) => state.removeHost);
  const { resolveDocUrl } = useRagFile();

  const [fetched, setFetched] = useState<Fetched>({ status: 'idle' });
  const panel = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    addHost();
    return removeHost;
  }, [addHost, removeHost]);

  const kind = useMemo(
    () => (doc ? previewKind(doc.href) : 'unsupported'),
    [doc]
  );

  useEffect(() => {
    if (!doc) {
      setFetched({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setFetched({ status: 'loading' });

    (async () => {
      try {
        const url = await resolveDocUrl(doc.href, 'knowledgeBase');

        if (cancelled) {
          return;
        }

        if (!needsFetch(previewKind(doc.href))) {
          setFetched({ status: 'ready', url });
          return;
        }

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`preview request failed: ${response.status}`);
        }

        const text = await response.text();

        if (!cancelled) {
          setFetched({
            status: 'ready',
            url,
            text: text.slice(0, MAX_TEXT_LENGTH),
          });
        }
      } catch (e) {
        console.error('Document preview failed', e);

        if (!cancelled) {
          // The document may still be reachable in its own tab, so keep the
          // signed URL around for the fallback button when there is one
          setFetched((previous) => ({
            status: 'error',
            url: previous.status === 'ready' ? previous.url : undefined,
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, resolveDocUrl]);

  useEffect(() => {
    if (!doc) {
      returnFocusTo.current?.focus?.();
      returnFocusTo.current = null;
      return;
    }

    if (returnFocusTo.current === null) {
      returnFocusTo.current = document.activeElement as HTMLElement | null;
    }

    panel.current?.focus();
  }, [doc]);

  useEffect(() => {
    if (!doc) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePreview();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [doc, closePreview]);

  const openInNewTab = useCallback(async () => {
    if (!doc) {
      return;
    }

    // Reuse the URL already signed for this open when there is one: opening
    // synchronously keeps the popup blocker out of it
    const signed =
      fetched.status === 'ready' || fetched.status === 'error'
        ? fetched.url
        : undefined;

    if (signed) {
      window.open(signed, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      const url = await resolveDocUrl(doc.href, 'knowledgeBase');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.error(e);
    }
  }, [doc, fetched, resolveDocUrl]);

  const unavailable = (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-[13px] text-[#969696]">
        {t('chat.preview_unavailable')}
      </div>
      <button
        type="button"
        onClick={openInNewTab}
        className="focus-visible:ring-aws-squid-ink rounded-lg border border-[#E8E8E8] px-3 py-1.5 text-[13px] hover:bg-[#F7F7F7] focus:outline-none focus-visible:ring-1">
        {t('chat.preview_open_new_tab')}
      </button>
    </div>
  );

  const body = useMemo(() => {
    if (!doc) {
      return null;
    }

    if (fetched.status === 'loading' || fetched.status === 'idle') {
      return (
        <div className="space-y-2 p-4" aria-hidden="true">
          <div className="h-3 w-2/3 animate-pulse rounded bg-[#EFEFEF]" />
          <div className="h-3 w-full animate-pulse rounded bg-[#EFEFEF]" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-[#EFEFEF]" />
        </div>
      );
    }

    if (fetched.status === 'error') {
      return unavailable;
    }

    if (kind === 'pdf') {
      return (
        <iframe
          src={fetched.url}
          title={doc.label}
          className="h-full w-full border-0"
        />
      );
    }

    if (kind === 'image') {
      return (
        <div className="flex h-full items-start justify-center p-4">
          <img src={fetched.url} alt={doc.label} className="max-w-full" />
        </div>
      );
    }

    if (kind === 'markdown') {
      // Untrusted document content: the Markdown component renders without
      // rehype-raw, so embedded HTML stays inert text
      return (
        <div className="p-4">
          <Markdown className="!text-[14px]">{fetched.text ?? ''}</Markdown>
        </div>
      );
    }

    if (kind === 'csv') {
      const table = parseCsv(fetched.text ?? '', CSV_ROW_LIMIT);

      if (table.headers.length === 0) {
        return unavailable;
      }

      return (
        <div className="p-4">
          <div className="overflow-x-auto rounded-lg border border-[#E8E8E8]">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-[#F7F7F7]">
                  {table.headers.map((header, idx) => (
                    <th
                      key={idx}
                      scope="col"
                      className="whitespace-nowrap border-b border-[#E8E8E8] px-3 py-2 text-left font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-[#EFEFEF]">
                    {table.headers.map((_header, cellIdx) => (
                      <td key={cellIdx} className="px-3 py-1.5 align-top">
                        {row[cellIdx] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {table.truncated && (
            <div className="mt-2 text-[11px] text-[#969696]">
              {t('chat.preview_csv_truncated', {
                count: table.rows.length,
                total: table.totalRows,
              })}
            </div>
          )}
        </div>
      );
    }

    if (kind === 'text') {
      return (
        <pre className="whitespace-pre-wrap break-words p-4 text-[13px] leading-relaxed">
          {fetched.text ?? ''}
        </pre>
      );
    }

    return unavailable;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, fetched, kind, t]);

  if (!doc) {
    return null;
  }

  return (
    <>
      {/* Below lg the panel is a sheet, so it gets a scrim to dismiss against */}
      <div
        className="fixed inset-0 z-40 bg-black/30 lg:hidden print:hidden"
        onClick={closePreview}
        aria-hidden="true"
      />
      <div
        ref={panel}
        role="dialog"
        aria-label={doc.label}
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 top-14 z-40 flex flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl focus:outline-none lg:inset-y-0 lg:left-auto lg:right-0 lg:top-0 lg:w-[max(420px,44vw)] lg:rounded-none lg:border-l lg:border-[#E8E8E8] lg:shadow-none print:hidden">
        <div className="flex flex-none items-center gap-2 border-b border-[#EFEFEF] px-3 py-2">
          <div
            className="min-w-0 flex-1 truncate text-[13px] font-medium"
            title={doc.label}>
            {doc.label}
          </div>
          {doc.page !== undefined && (
            <span className="bg-aws-rind text-aws-smile flex-none rounded-md px-2 py-0.5 text-[11px] font-medium">
              {t('chat.preview_page', { page: doc.page })}
            </span>
          )}
          <ButtonIcon
            className="flex-none text-base text-[#969696] hover:text-[#5A5A5A]"
            title={t('chat.preview_open_new_tab')}
            onClick={openInNewTab}>
            <PiArrowSquareOut />
          </ButtonIcon>
          <ButtonIcon
            className="flex-none text-base text-[#969696] hover:text-[#5A5A5A]"
            title={t('common.close')}
            onClick={closePreview}>
            <PiX />
          </ButtonIcon>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      </div>
    </>
  );
};

export default DocumentPreviewPanel;
