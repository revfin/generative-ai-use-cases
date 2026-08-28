import React from 'react';
import {
  PiPaperPlaneRightFill,
  PiSpinnerGap,
  PiStopFill,
} from 'react-icons/pi';
import { BaseProps } from '../@types/common';

type Props = BaseProps & {
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  canStop?: boolean;
};

const ButtonSend: React.FC<Props> = (props) => {
  return (
    <button
      className={`${
        props.className ?? ''
      } flex size-9 items-center justify-center rounded-lg text-base text-white transition-colors ${
        props.disabled
          ? 'bg-[#E8E8E8] text-[#969696]'
          : 'bg-aws-squid-ink hover:bg-aws-anchor'
      }`}
      onClick={props.onClick}
      disabled={props.disabled}>
      {props.loading ? (
        <>
          {props.canStop ? (
            <PiStopFill />
          ) : (
            <PiSpinnerGap className="animate-spin" />
          )}
        </>
      ) : (
        <>{props.icon ? <>{props.icon}</> : <PiPaperPlaneRightFill />}</>
      )}
    </button>
  );
};

export default ButtonSend;
