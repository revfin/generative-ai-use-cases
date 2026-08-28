import React, { useMemo } from 'react';
import { BaseProps } from '../@types/common';
import ButtonIcon from './ButtonIcon';
import {
  PiThumbsUp,
  PiThumbsDown,
  PiThumbsUpFill,
  PiThumbsDownFill,
} from 'react-icons/pi';
import { ShownMessage } from 'generative-ai-use-cases';
import { useTranslation } from 'react-i18next';

type Props = BaseProps & {
  message: ShownMessage;
  feedback: string;
  onClick: () => void;
  disabled: boolean;
};

const ButtonFeedback: React.FC<Props> = (props) => {
  const { t } = useTranslation();

  const active = useMemo(() => {
    return props.message.feedback === props.feedback;
  }, [props.message.feedback, props.feedback]);

  // Feedback is an aside, not a verdict: muted until the user actually votes
  const color = useMemo(() => {
    if (!active) {
      return 'text-[#969696] hover:text-[#5A5A5A]';
    }

    return props.feedback === 'good' ? 'text-aws-squid-ink' : 'text-[#B42318]';
  }, [active, props.feedback]);

  const icon = useMemo(() => {
    if (props.feedback === 'good') {
      return active ? <PiThumbsUpFill /> : <PiThumbsUp />;
    }

    return active ? <PiThumbsDownFill /> : <PiThumbsDown />;
  }, [active, props.feedback]);

  return (
    <ButtonIcon
      className={`${props.className ?? ''} text-base ${color}`}
      disabled={props.disabled}
      title={
        props.feedback === 'good'
          ? t('chat.feedback_good')
          : t('chat.feedback_bad')
      }
      onClick={props.onClick}>
      {icon}
    </ButtonIcon>
  );
};

export default ButtonFeedback;
