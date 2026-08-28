import React, { useMemo } from 'react';
import { BaseProps } from '../@types/common';
import { PiArrowLineDownFill, PiArrowLineUpFill } from 'react-icons/pi';
import useScreen from '../hooks/useScreen';
import { useTranslation } from 'react-i18next';

type Props = BaseProps;

const ScrollTopBottom: React.FC<Props> = (props) => {
  const { t } = useTranslation();
  const { isAtBottom, isAtTop, scrollToBottom, scrollToTop } = useScreen();

  // Whether it is possible to scroll to the bottom
  // If already reached, it is not possible
  const scrollToBottomAvailable = useMemo(() => {
    return !isAtBottom;
  }, [isAtBottom]);

  // Whether it is possible to scroll to the top
  // If already reached, it is not possible
  const scrollToTopAvailable = useMemo(() => {
    return !isAtTop;
  }, [isAtTop]);

  return (
    <div
      className={`text-aws-font-color flex w-fit flex-col overflow-hidden rounded-lg border border-[#E8E8E8] bg-white text-sm ${!scrollToTopAvailable && !scrollToBottomAvailable ? 'hidden' : ''} ${props.className ?? ''} print:hidden`}>
      <button
        className={`focus-visible:ring-aws-squid-ink flex h-8 w-8 items-center justify-center hover:bg-[#F7F7F7] focus:outline-none focus-visible:ring-1 ${scrollToTopAvailable ? '' : 'text-[#C9C9C9]'}`}
        aria-label={t('common.scroll_to_top')}
        title={t('common.scroll_to_top')}
        onClick={scrollToTop}
        disabled={!scrollToTopAvailable}>
        <PiArrowLineUpFill />
      </button>
      <button
        className={`focus-visible:ring-aws-squid-ink flex h-8 w-8 items-center justify-center border-t border-[#EFEFEF] hover:bg-[#F7F7F7] focus:outline-none focus-visible:ring-1 ${scrollToBottomAvailable ? '' : 'text-[#C9C9C9]'}`}
        aria-label={t('common.scroll_to_bottom')}
        title={t('common.scroll_to_bottom')}
        onClick={scrollToBottom}
        disabled={!scrollToBottomAvailable}>
        <PiArrowLineDownFill />
      </button>
    </div>
  );
};

export default ScrollTopBottom;
