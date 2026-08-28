import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TurnStatus } from '../utils/turnStatus';

type Props = {
  status?: TurnStatus;
};

/**
 * The one-line status shown where the answer will appear.
 *
 * It never invents work: with nothing real to report it falls back to the bare
 * cursor this replaced, so the placeholder is one element, not two.
 */
const TurnStatusStrip: React.FC<Props> = ({ status }) => {
  const { t } = useTranslation();

  const label = useMemo(() => {
    switch (status?.phase) {
      case 'searching':
        return t('chat.status_searching');
      case 'reading':
        return t('chat.status_reading', { count: status.sourceCount });
      case 'thinking':
        return t('chat.status_thinking');
      default:
        return null;
    }
  }, [status, t]);

  if (label === null) {
    return (
      /* eslint-disable-next-line @shopify/jsx-no-hardcoded-content */
      <div className="animate-pulse" aria-hidden="true">
        ▍
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center py-0.5 text-[13px]">
      <span className="mimir-shimmer">{label}</span>
    </div>
  );
};

export default TurnStatusStrip;
