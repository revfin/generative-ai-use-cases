import React, { useMemo, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import useChatApi from '../hooks/useChatApi';
import useSystemContextApi from '../hooks/useSystemContextApi';
import ChatMessage from '../components/ChatMessage';
import useBranding from '../hooks/useBranding';
import ScrollTopBottom from '../components/ScrollTopBottom';
import ModalSystemContext from '../components/ModalSystemContext';
import { useTranslation } from 'react-i18next';

const SharedChatPage: React.FC = () => {
  const { t } = useTranslation();
  const { logoPath } = useBranding();
  const { shareId } = useParams();
  const { getSharedChat } = useChatApi();
  const { data: chatAndMessages, isLoading, error } = getSharedChat(shareId!);
  const [showSystemContextModal, setShowSystemContextModal] = useState(false);
  const [saveSystemContext, setSaveSystemContext] = useState('');
  const [saveSystemContextTitle, setSaveSystemContextTitle] = useState('');
  const { createSystemContext } = useSystemContextApi();

  const title = useMemo(() => {
    if (chatAndMessages) {
      return chatAndMessages.chat.title;
    } else {
      return '';
    }
  }, [chatAndMessages]);

  const rawMessages = useMemo(() => {
    if (chatAndMessages) {
      return chatAndMessages.messages;
    } else {
      return [];
    }
  }, [chatAndMessages]);

  const messages = useMemo(() => {
    return rawMessages.filter((message) => message.role !== 'system');
  }, [rawMessages]);

  const [showSystemContext, setShowSystemContext] = useState(false);

  const showingMessages = useMemo(() => {
    if (showSystemContext) {
      return rawMessages;
    } else {
      return messages;
    }
  }, [showSystemContext, rawMessages, messages]);

  const onCreateSystemContext = useCallback(async () => {
    try {
      await createSystemContext(saveSystemContextTitle, saveSystemContext);
    } catch (e) {
      console.error(e);
    } finally {
      setShowSystemContextModal(false);
      setSaveSystemContextTitle('');
    }
  }, [
    createSystemContext,
    setShowSystemContextModal,
    setSaveSystemContextTitle,
    saveSystemContextTitle,
    saveSystemContext,
  ]);

  return (
    <>
      <div className="relative pb-16">
        <div className="invisible h-0 border-[#EFEFEF] bg-white/90 backdrop-blur lg:visible lg:sticky lg:top-0 lg:z-10 lg:flex lg:h-14 lg:items-center lg:border-b lg:px-6 print:visible print:h-min">
          <div className="truncate text-sm font-medium">{title}</div>
        </div>

        {isLoading && (
          <div className="relative flex h-[calc(100vh-13rem)] flex-col items-center justify-center">
            {logoPath ? (
              <img
                src={logoPath}
                alt=""
                className="size-12 animate-pulse rounded-xl"
              />
            ) : null}
          </div>
        )}

        {!isLoading && chatAndMessages && (
          <>
            <div className="my-2 flex justify-end px-6 pt-3">
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  value=""
                  className="peer sr-only"
                  checked={showSystemContext}
                  onChange={() => {
                    setShowSystemContext(!showSystemContext);
                  }}
                />
                <div className="peer-checked:bg-aws-squid-ink peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:size-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white rtl:peer-checked:after:-translate-x-full"></div>
                <span className="ml-1 text-xs font-medium">
                  {t('chat.show_system_prompt')}
                </span>
              </label>
            </div>

            {showingMessages.map((chat, idx) => (
              <ChatMessage
                key={showSystemContext ? idx : idx + 1}
                idx={idx}
                chatContent={chat}
                loading={isLoading && idx === showingMessages.length - 1}
                hideFeedback={true}
                setSaveSystemContext={setSaveSystemContext}
                setShowSystemContextModal={setShowSystemContextModal}
              />
            ))}

            <div className="fixed right-4 top-[calc(50vh-2rem)] z-0 lg:right-8">
              <ScrollTopBottom />
            </div>

            <ModalSystemContext
              showSystemContextModal={showSystemContextModal}
              saveSystemContext={saveSystemContext}
              saveSystemContextTitle={saveSystemContextTitle}
              setShowSystemContextModal={setShowSystemContextModal}
              setSaveSystemContext={setSaveSystemContext}
              setSaveSystemContextTitle={setSaveSystemContextTitle}
              onCreateSystemContext={onCreateSystemContext}
            />
          </>
        )}

        {!isLoading && error && (
          <div className="flex h-[calc(100vh-13rem)] flex-col items-center justify-center text-lg font-bold">
            {t('shared.error')} {error.response.status}
            {error.response.status === 404 ? (
              <div className="mt-2 text-sm">
                {t('shared.not_found_message')}
              </div>
            ) : (
              <div className="mt-2 text-sm">{t('shared.contact_admin')}</div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default SharedChatPage;
