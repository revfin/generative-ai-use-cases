import React, { useState } from 'react';
import Button from './Button';
import { useTranslation } from 'react-i18next';

type Props = {
  onSubmit: (reasons: string[], feedback: string) => void;
  onCancel: () => void;
};

const FeedbackForm: React.FC<Props> = ({ onSubmit, onCancel }) => {
  const { t } = useTranslation();
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string>('');
  const [error, setError] = useState<string>('');

  const reasons = [
    t('feedback.reasons.inaccurate'),
    t('feedback.reasons.outdated'),
    t('feedback.reasons.harmful'),
    t('feedback.reasons.other'),
  ];

  const handleReasonChange = (reason: string) => {
    setSelectedReasons((prev) =>
      prev.includes(reason)
        ? prev.filter((r) => r !== reason)
        : [...prev, reason]
    );
    setError('');
  };

  const handleSubmit = () => {
    if (selectedReasons.length === 0) {
      setError(t('feedback.reason_error'));
      return;
    }
    onSubmit(selectedReasons, feedback);
  };

  return (
    <div className="mt-3 rounded-xl border border-[#E8E8E8] bg-white p-4">
      <h3 className="mb-3 text-[13px] font-medium text-[#5A5A5A]">
        {t('feedback.reason_title')}
      </h3>
      <div className="mb-3 flex flex-wrap gap-2">
        {reasons.map((reason) => (
          <button
            key={reason}
            type="button"
            aria-pressed={selectedReasons.includes(reason)}
            onClick={() => handleReasonChange(reason)}
            className={`focus-visible:ring-aws-squid-ink rounded-full border px-3 py-1 text-[13px] transition-colors focus:outline-none focus-visible:ring-1 ${
              selectedReasons.includes(reason)
                ? 'border-aws-squid-ink/30 text-aws-squid-ink bg-[#1C256C]/[0.06]'
                : 'border-[#E8E8E8] bg-white text-[#5A5A5A] hover:bg-[#F7F7F7]'
            }`}>
            {reason}
          </button>
        ))}
      </div>
      {error && <p className="mb-2 text-[13px] text-[#B42318]">{error}</p>}
      <textarea
        className="focus:border-aws-squid-ink mb-3 w-full rounded-lg border-[#E8E8E8] p-2 text-[13px] placeholder:text-[#969696] focus:ring-0"
        placeholder={t('feedback.additional_feedback')}
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={3}
      />
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} outlined={true}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleSubmit} outlined={false}>
          {t('common.submit')}
        </Button>
      </div>
    </div>
  );
};

export default FeedbackForm;
