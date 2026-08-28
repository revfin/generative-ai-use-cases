import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PiMagnifyingGlass, PiNotePencil } from 'react-icons/pi';
import ChatList from './ChatList';
import type { DrawerItemProps } from './DrawerItem';
import DrawerBase from './DrawerBase';
import { useTranslation } from 'react-i18next';
import useBranding from '../hooks/useBranding';
import useDrawer from '../hooks/useDrawer';

// Kept for compatibility with upstream drawer consumers
export type ItemProps = DrawerItemProps & {
  display: 'usecase' | 'tool' | 'none';
};

const Drawer: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { switchOpen } = useDrawer();
  const { title: brandingTitle, logoPath } = useBranding();

  const [searchQuery, setSearchQuery] = useState('');
  const searchWords = useMemo(() => {
    return searchQuery
      .split(' ')
      .flatMap((q) => q.split('　'))
      .filter((q) => q !== '');
  }, [searchQuery]);

  // On narrow screens the drawer overlays the chat, so close it on navigation
  const closeIfOverlay = useCallback(() => {
    if (
      document
        .getElementById('smallDrawerFiller')
        ?.classList.contains('visible')
    ) {
      switchOpen();
    }
  }, [switchOpen]);

  // The new chat always lives at /chat, so the page is told to reset the
  // conversation - navigating alone would keep the previous draft
  const onClickNewChat = useCallback(() => {
    setSearchQuery('');
    navigate('/chat', { state: { newChat: Date.now() } });
    closeIfOverlay();
  }, [navigate, closeIfOverlay]);

  return (
    <DrawerBase>
      <div className="flex items-center gap-2 px-4 py-4">
        {logoPath ? (
          <img src={logoPath} alt="" className="size-7 rounded-lg" />
        ) : null}
        <span className="text-aws-squid-ink text-[15px] font-semibold">
          {brandingTitle || t('auth.title')}
        </span>
      </div>

      <div className="px-3">
        <button
          className="text-aws-font-color flex h-9 w-full items-center gap-2 rounded-lg border border-[#E8E8E8] px-3 text-[13px] font-medium hover:bg-[#F7F7F7]"
          onClick={onClickNewChat}>
          <PiNotePencil className="text-base text-[#969696]" />
          {t('chat.new_chat')}
        </button>
      </div>

      <div className="relative px-3 pt-3">
        <PiMagnifyingGlass className="pointer-events-none absolute left-6 top-[1.375rem] text-[#969696]" />
        <input
          className="text-aws-font-color h-9 w-full rounded-lg border-[#E8E8E8] bg-white pl-8 text-[13px] placeholder:text-[#969696] focus:border-[#E8E8E8] focus:ring-0"
          type="text"
          value={searchQuery}
          placeholder={t('chat.search_by_title')}
          onChange={(event) => {
            setSearchQuery(event.target.value ?? '');
          }}
        />
      </div>

      <div className="px-4 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-[#969696]">
        {t('chat.recent')}
      </div>
      <div className="scrollbar-thin scrollbar-thumb-gray-200 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <ChatList searchWords={searchWords} onNavigate={closeIfOverlay} />
      </div>
    </DrawerBase>
  );
};

export default Drawer;
