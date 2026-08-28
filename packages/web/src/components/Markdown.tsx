import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  memo,
  lazy,
  Suspense,
} from 'react';
import { useTranslation } from 'react-i18next';
import { BaseProps } from '../@types/common';
import { default as ReactMarkdown } from 'react-markdown';
import type { ExtraProps } from 'react-markdown';
import type { ComponentProps } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkBreaks from 'remark-breaks';
import ButtonCopy from './ButtonCopy';
import useRagFile from '../hooks/useRagFile';
import { PiSpinnerGap } from 'react-icons/pi';
import useFileApi from '../hooks/useFileApi';
import useDocumentPreview from '../hooks/useDocumentPreview';
import { useCitations } from './CitationContext';
import { previewFileName, previewPage } from '../utils/documentPreview';
import 'katex/dist/katex.min.css';

// Reduce bundle size by registering only the languages used in the project
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import graphql from 'react-syntax-highlighter/dist/esm/languages/prism/graphql';
import ini from 'react-syntax-highlighter/dist/esm/languages/prism/ini';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import perl from 'react-syntax-highlighter/dist/esm/languages/prism/perl';
import php from 'react-syntax-highlighter/dist/esm/languages/prism/php';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import xmlDoc from 'react-syntax-highlighter/dist/esm/languages/prism/xml-doc';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import { useLocation } from 'react-router-dom';

import { SvgWithToggle } from './Svg/SvgWithToggle';

// Mermaid and ECharts are heavy renderers that only a small share of answers
// use, so they are pulled in on demand instead of on first paint
const MermaidWithToggle = lazy(() =>
  import('./Mermaid/MermaidWithToggle').then((m) => ({
    default: m.MermaidWithToggle,
  }))
);
const EChartsWithToggle = lazy(() =>
  import('./ECharts/EChartsWithToggle').then((m) => ({
    default: m.EChartsWithToggle,
  }))
);

const RendererFallback = () => (
  <div className="my-4 h-24 animate-pulse rounded-lg bg-[#F7F7F7]" />
);

SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('c', c);
SyntaxHighlighter.registerLanguage('cpp', cpp);
SyntaxHighlighter.registerLanguage('csharp', csharp);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('diff', diff);
SyntaxHighlighter.registerLanguage('go', go);
SyntaxHighlighter.registerLanguage('graphql', graphql);
SyntaxHighlighter.registerLanguage('ini', ini);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('perl', perl);
SyntaxHighlighter.registerLanguage('php', php);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('xml-doc', xmlDoc);
SyntaxHighlighter.registerLanguage('yaml', yaml);

// Re-export MermaidWithToggle for backward compatibility
export { MermaidWithToggle };

const ragKnowledgeBaseEnabled: boolean =
  import.meta.env.VITE_APP_RAG_KNOWLEDGE_BASE_ENABLED === 'true';

type Props = BaseProps & {
  children: string;
  prefix?: string;
};

// The anchor an inline `[^src-0]` pill points at: `#<prefix>-fn-src-0`. The
// backref in the footnote list (`-fnref-src-0`) deliberately does not match.
const FOOTNOTE_ANCHOR = /(?:^|-)fn-(src-\d+)$/;

const LinkRenderer = ({
  href,
  children,
  id,
}: ComponentProps<'a'> & ExtraProps) => {
  // Currently, the file download function from S3 is only used in RAG chat
  const { downloadDoc, isS3Url, downloading } = useRagFile();
  const citations = useCitations();
  const openPreview = useDocumentPreview((state) => state.openPreview);
  const openHref = useDocumentPreview((state) => state.doc?.href);
  const hasPanel = useDocumentPreview((state) => state.hosts > 0);

  const isS3 = useMemo(() => {
    return isS3Url(href ?? '');
  }, [isS3Url, href]);

  // Both the inline pill and the entry in the source list stand for the same
  // document, so both open - and highlight - the same preview
  const target = useMemo(() => {
    if (isS3) {
      return href ?? '';
    }

    const label = FOOTNOTE_ANCHOR.exec(href?.replace(/^#/, '') ?? '')?.[1];

    return label ? (citations[label]?.href ?? '') : '';
  }, [citations, href, isS3]);

  // For Knowledge Base, we pass s3Type as a parameter
  // since it may need to reference S3 from a different account.
  // Retrieval now happens inside the main chat, so every S3 citation in this
  // app comes from the knowledge base when it is enabled.
  const location = useLocation();
  const isKnowledgeBase = useMemo(() => {
    return (
      ragKnowledgeBaseEnabled ||
      location.pathname.includes('/rag-knowledge-base')
    );
  }, [location.pathname]);

  const openDocument = useCallback(() => {
    if (target === '') {
      return false;
    }

    // Pages without a preview panel (shared conversations, agent chats) keep
    // the original behaviour: sign the URL and hand it to a new tab
    if (!hasPanel) {
      if (isS3 && !downloading) {
        downloadDoc(target, isKnowledgeBase ? 'knowledgeBase' : 'default');
        return true;
      }
      return false;
    }

    openPreview({
      href: target,
      label: previewFileName(target),
      page: previewPage(target),
    });

    return true;
  }, [
    downloadDoc,
    downloading,
    hasPanel,
    isKnowledgeBase,
    isS3,
    openPreview,
    target,
  ]);

  const active = target !== '' && target === openHref;
  const activeProps = {
    'data-citation-active': active ? 'true' : undefined,
  };

  return (
    <>
      {isS3 ? (
        // No href: the raw S3 URL is unsigned and would 403 on a plain
        // navigation. `role`/`tabIndex`/`onKeyDown` restore the keyboard path
        // that a bare `<a onClick>` loses.
        <a
          id={id}
          role="button"
          tabIndex={0}
          onClick={openDocument}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openDocument();
            }
          }}
          {...activeProps}
          className={`cursor-pointer ${downloading ? 'text-gray-400' : ''} ${
            active ? 'text-aws-smile' : ''
          }`}>
          {children}
          {downloading && (
            <PiSpinnerGap className="mx-2 inline-block animate-spin" />
          )}
        </a>
      ) : (
        <a
          id={id}
          href={href}
          target={href?.startsWith('#') ? '_self' : '_blank'}
          rel="noreferrer"
          {...activeProps}
          onClick={(event) => {
            // A citation pill jumps to the footnote only when there is nothing
            // better to do with it
            if (openDocument()) {
              event.preventDefault();
            }
          }}>
          {children}
        </a>
      )}
    </>
  );
};

const ImageRenderer = ({
  src: srcProp,
  id,
}: ComponentProps<'img'> & ExtraProps) => {
  const { t } = useTranslation();
  const { isS3Url } = useRagFile();
  const { getFileDownloadSignedUrl } = useFileApi();
  const [src, setSrc] = useState(srcProp);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isS3Url(srcProp ?? '')) {
      getFileDownloadSignedUrl(srcProp ?? '')
        .then((url) => setSrc(url))
        .catch((e: Error) => setError(e.message));
    }
  }, [getFileDownloadSignedUrl, isS3Url, srcProp]);

  if (error) {
    return (
      <span className="text-red-500">{t('image.load_error', { error })}</span>
    );
  }
  return <img id={id} src={src} />;
};

// PreRenderer to skip <pre> tag for mermaid and SVG code blocks
// This prevents the dark prose background from appearing around these diagrams
const PreRenderer = ({
  children,
  ...rest
}: ComponentProps<'pre'> & ExtraProps) => {
  // Check if children is a code element with 'language-mermaid' or SVG-related class
  if (React.isValidElement(children)) {
    const childProps = children.props as {
      className?: string;
      children?: string;
    };
    const className = childProps?.className || '';
    const codeContent = String(childProps?.children || '').trim();

    // Skip <pre> tag for mermaid
    if (className.includes('language-mermaid')) {
      return <>{children}</>;
    }

    // Skip <pre> tag for chart (ECharts)
    if (className.includes('language-chart')) {
      return <>{children}</>;
    }

    // Skip <pre> tag for highlighted code blocks: CodeRenderer draws its own
    // panel (hairline border + language bar) around the highlighter
    if (className.includes('language-')) {
      return <>{children}</>;
    }

    // Skip <pre> tag for SVG (when language is svg, or xml/html with SVG content)
    if (
      className.includes('language-svg') ||
      ((className.includes('language-xml') ||
        className.includes('language-html')) &&
        (codeContent.startsWith('<svg') || codeContent.startsWith('<?xml')))
    ) {
      return <>{children}</>;
    }
  }

  // For other code blocks, render normal <pre> tag
  return <pre {...rest}>{children}</pre>;
};

// Helper function to check if code is SVG
const isSvgCode = (code: string): boolean => {
  const trimmed = code.trim();
  return trimmed.startsWith('<svg') || trimmed.startsWith('<?xml');
};

const CodeRenderer = memo(
  ({
    className,
    children,
  }: React.ComponentPropsWithoutRef<'code'> & ExtraProps) => {
    const language = /language-(\w+)/.exec(className || '')?.[1];
    const codeText = String(children).replace(/\n$/, '');
    const isCodeBlock = codeText.includes('\n');

    // Render Mermaid diagrams with toggle
    // Use not-prose to prevent prose styles from affecting the diagram container
    if (language === 'mermaid') {
      return (
        <Suspense fallback={<RendererFallback />}>
          <MermaidWithToggle code={codeText} />
        </Suspense>
      );
    }

    // Render SVG code with toggle (when language is svg, xml, or html and content is SVG)
    const isSvgLanguage =
      language === 'svg' ||
      ((language === 'xml' || language === 'html') && isSvgCode(codeText));
    if (isSvgLanguage) {
      return <SvgWithToggle code={codeText} />;
    }

    // Render ECharts charts with toggle
    if (language === 'chart') {
      return (
        <Suspense fallback={<RendererFallback />}>
          <EChartsWithToggle code={codeText} />
        </Suspense>
      );
    }

    return (
      <>
        {language ? (
          // Code block with language
          <div className="not-prose my-4 overflow-hidden rounded-lg border border-[#E8E8E8]">
            <div className="flex items-center justify-between border-b border-[#E8E8E8] bg-[#F7F7F7] px-3 py-1">
              <span className="text-[11px] text-[#5A5A5A]">{language}</span>
              <ButtonCopy
                className="text-base text-[#969696]"
                text={codeText}
              />
            </div>
            <SyntaxHighlighter
              style={vscDarkPlus}
              customStyle={{
                margin: 0,
                borderRadius: 0,
                fontSize: '13px',
                padding: '0.875rem 1rem',
              }}
              language={language || 'plaintext'}>
              {codeText}
            </SyntaxHighlighter>
          </div>
        ) : isCodeBlock ? (
          // Code block without language
          <code className="block rounded-md py-1">
            {codeText.split('\n').map((line, index) => (
              <span key={`line-${index}`} className="block px-1 py-0">
                {line}
              </span>
            ))}
          </code>
        ) : (
          // Inline code
          <span className="text-aws-squid-ink inline rounded border border-[#E8E8E8] bg-[#F7F7F7] px-1 py-0.5 text-[0.9em]">
            {codeText}
          </span>
        )}
      </>
    );
  },
  (prevProps, nextProps) => {
    // Only re-render if the code content or language changes
    return (
      String(prevProps.children) === String(nextProps.children) &&
      prevProps.className === nextProps.className
    );
  }
);

const Markdown = memo(({ className, prefix, children }: Props) => {
  return (
    <ReactMarkdown
      className={`${className ?? ''} prose prose-neutral text-aws-font-color max-w-full text-[15px] leading-relaxed`}
      children={children}
      remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      remarkRehypeOptions={{ clobberPrefix: prefix }}
      components={{
        a: LinkRenderer,
        img: ImageRenderer,
        sup: ({ children }) => (
          <sup className="text-aws-squid-ink mx-0.5 rounded bg-[#1C256C]/[0.07] px-1.5 py-0.5 text-[11px] font-medium no-underline">
            {children}
          </sup>
        ),
        pre: PreRenderer,
        code: CodeRenderer,
      }}
    />
  );
});

export default Markdown;
