import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const NotFound: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-2">
      {/* eslint-disable-next-line @shopify/jsx-no-hardcoded-content */}
      <h1 className="text-aws-font-color text-4xl font-medium">404</h1>
      <h2 className="text-[15px] text-[#969696]">{t('notfound.title')}</h2>
      <Link
        className="text-aws-squid-ink mt-2 rounded-lg border border-[#E8E8E8] px-3 py-1.5 text-[13px] hover:bg-[#F7F7F7]"
        to="/chat">
        {t('notfound.back_to_chat')}
      </Link>
    </div>
  );
};

export default NotFound;
