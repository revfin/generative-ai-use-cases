import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PiCaretRight } from 'react-icons/pi';
import Markdown from './Markdown';

type Props = {
  /** The reasoning / trace text streamed so far. */
  content: string;
  /** The last non-code trace line, shown while the block is collapsed. */
  inlineMessage?: string;
  /** The turn is still in flight. */
  streaming?: boolean;
  /** Answer tokens have started arriving, so the reasoning is done. */
  answerStarted?: boolean;
  prefix?: string;
};

/**
 * The model's reasoning, live.
 *
 * This is the trace block GenU already rendered under every answer - Bedrock
 * streams `reasoningContent` deltas into the same `trace` field - restyled from
 * a bordered grey panel into a quiet margin note: hairline left rule, muted
 * 13px, expanded while it is being written and collapsed to a single
 * "Thought for Ns" row the moment the answer takes over.
 */
const ThinkingBlock: React.FC<Props> = (props) => {
  const { t } = useTranslation();
  const active = (props.streaming ?? false) && !props.answerStarted;

  const [open, setOpen] = useState(active);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const startedAt = useRef<number | null>(null);
  const toggledByUser = useRef(false);

  // Duration is measured, not stored: a conversation restored from history has
  // no timing, and it says "Thought process" instead of inventing a number
  useEffect(() => {
    if (active) {
      if (startedAt.current === null) {
        startedAt.current = Date.now();
      }
      return;
    }

    if (startedAt.current !== null && elapsedMs === null) {
      setElapsedMs(Date.now() - startedAt.current);
    }
  }, [active, elapsedMs]);

  useEffect(() => {
    if (!toggledByUser.current) {
      setOpen(active);
    }
  }, [active]);

  const toggle = useCallback(() => {
    toggledByUser.current = true;
    setOpen((previous) => !previous);
  }, []);

  const label = active
    ? t('chat.thinking')
    : elapsedMs === null
      ? t('chat.thought_process')
      : t('chat.thought_for', {
          seconds: Math.max(1, Math.round(elapsedMs / 1000)),
        });

  return (
    <div className="mb-3 border-l border-[#E8E8E8] pl-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="focus-visible:ring-aws-squid-ink -ml-1 flex items-center gap-1 rounded px-1 py-0.5 text-[13px] text-[#969696] hover:text-[#5A5A5A] focus:outline-none focus-visible:ring-1">
        <PiCaretRight
          aria-hidden="true"
          className={`text-[11px] transition-transform duration-200 ${
            open ? 'rotate-90' : ''
          }`}
        />
        <span className={active ? 'mimir-shimmer' : ''}>{label}</span>
      </button>

      {open && props.content.trim() !== '' && (
        <Markdown
          className="mt-1 !text-[13px] !leading-relaxed !text-[#969696]"
          prefix={props.prefix}>
          {props.content}
        </Markdown>
      )}

      {!open && active && props.inlineMessage && (
        <Markdown
          className="mt-1 !text-[13px] !leading-relaxed !text-[#969696]"
          prefix={`${props.prefix}-inline`}>
          {props.inlineMessage}
        </Markdown>
      )}
    </div>
  );
};

export default ThinkingBlock;
