import React, { useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { PiList, PiX } from 'react-icons/pi';
import { Outlet } from 'react-router-dom';
import Drawer from './components/Drawer';
import ButtonIcon from './components/ButtonIcon';
import '@aws-amplify/ui-react/styles.css';
import useDrawer from './hooks/useDrawer';
import useChatList from './hooks/useChatList';
import useScreen from './hooks/useScreen';
import { useTranslation } from 'react-i18next';

// Extract :chatId from /chat/:chatId format
// Return null if path is in a different format
const extractChatId = (path: string): string | null => {
  const pattern = /\/chat\/(.+)/;
  const match = path.match(pattern);

  return match ? match[1] : null;
};

const App: React.FC = () => {
  const { t } = useTranslation();
  const { switchOpen: switchDrawer, opened: isOpenDrawer } = useDrawer();
  const { pathname } = useLocation();
  const { getChatTitle } = useChatList();
  const { screen, notifyScreen, scrollTopAnchorRef, scrollBottomAnchorRef } =
    useScreen();

  const label = useMemo(() => {
    const chatId = extractChatId(pathname);

    if (chatId) {
      return getChatTitle(chatId) || t('chat.title');
    } else if (pathname === '/setting') {
      return t('navigation.settings');
    } else {
      return t('chat.new_chat');
    }
  }, [pathname, getChatTitle, t]);

  // When there is no scroll event (e.g. moving from the top of the page to the top of the page)
  // The top/bottom determination is not made, so re-determine it according to the change of pathname
  useEffect(() => {
    if (screen.current) {
      notifyScreen(screen.current);
    }
  }, [pathname, screen, notifyScreen]);

  return (
    <div
      className="screen:w-screen screen:h-screen overflow-x-hidden overflow-y-scroll bg-white"
      ref={screen}>
      <main className="flex-1">
        <div ref={scrollTopAnchorRef}></div>
        <header className="visible flex h-14 w-full items-center justify-between border-b border-[#EFEFEF] bg-white/90 text-sm font-medium backdrop-blur lg:invisible lg:h-0 lg:border-0 print:hidden">
          <div className="flex w-12 items-center justify-start">
            <button
              className="focus:ring-aws-squid-ink text-aws-font-color ml-2 rounded-lg p-2 text-xl hover:bg-[#F7F7F7] focus:outline-none focus:ring-1"
              aria-label={t('navigation.menu')}
              onClick={() => {
                switchDrawer();
              }}>
              <PiList />
            </button>
          </div>

          <div className="truncate px-2">{label}</div>

          {/* Dummy block to center the label */}
          <div className="w-12" />
        </header>

        <div
          className={`fixed -left-72 top-0 z-50 transition-all lg:left-0 lg:z-0 ${
            isOpenDrawer ? 'left-0' : '-left-72'
          }`}>
          <Drawer />
        </div>

        <div
          id="smallDrawerFiller"
          className={`${isOpenDrawer ? 'visible' : 'invisible'} lg:invisible`}>
          <div
            className="screen:h-screen fixed top-0 z-40 w-screen bg-black/40"
            onClick={switchDrawer}></div>
          <ButtonIcon
            className="fixed left-72 top-1 z-40 text-white"
            onClick={switchDrawer}>
            <PiX />
          </ButtonIcon>
        </div>
        <div className="text-aws-font-color lg:ml-72">
          <Outlet />
        </div>
        <div ref={scrollBottomAnchorRef}></div>
      </main>
    </div>
  );
};

export default App;
