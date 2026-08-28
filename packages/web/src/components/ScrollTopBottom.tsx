import React, { useMemo } from 'react';
import { BaseProps } from '../@types/common';
import { PiArrowLineDownFill, PiArrowLineUpFill } from 'react-icons/pi';
import useScreen from '../hooks/useScreen';

type Props = BaseProps;

const ScrollTopBottom: React.FC<Props> = (props) => {
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
        className={`flex h-8 w-8 items-center justify-center hover:bg-[#F7F7F7] ${scrollToTopAvailable ? '' : 'text-[#C9C9C9]'}`}
        onClick={scrollToTop}
        disabled={!scrollToTopAvailable}>
        <PiArrowLineUpFill />
      </button>
      <button
        className={`flex h-8 w-8 items-center justify-center border-t border-[#EFEFEF] hover:bg-[#F7F7F7] ${scrollToBottomAvailable ? '' : 'text-[#C9C9C9]'}`}
        onClick={scrollToBottom}
        disabled={!scrollToBottomAvailable}>
        <PiArrowLineDownFill />
      </button>
    </div>
  );
};

export default ScrollTopBottom;
