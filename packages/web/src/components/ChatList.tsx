import React, { useCallback, useMemo } from 'react';
import { BaseProps } from '../@types/common';
import useChatList from '../hooks/useChatList';
import { useNavigate, useParams } from 'react-router-dom';
import ChatListItem from './ChatListItem';
import { decomposeId } from '../utils/ChatUtils';
import { useTranslation } from 'react-i18next';

type Props = BaseProps & {
  searchWords: string[];
  onNavigate?: () => void;
};

const ChatList: React.FC<Props> = (props) => {
  const { t } = useTranslation();
  const { chats, loading, deleteChat, updateChatTitle, canLoadMore, loadMore } =
    useChatList();
  const { chatId } = useParams();
  const navigate = useNavigate();

  const onDelete = useCallback(
    async (_chatId: string) => {
      navigate('/chat');
      return await deleteChat(_chatId).catch(() => {
        navigate(`/chat/${_chatId}`);
      });
    },
    [deleteChat, navigate]
  );

  const onUpdateTitle = useCallback(
    (_chatId: string, title: string) => {
      return updateChatTitle(_chatId, title);
    },
    [updateChatTitle]
  );

  const searchedChats = useMemo(() => {
    if (props.searchWords.length === 0) {
      return chats;
    }

    // OR search
    return chats.filter((c) => {
      return props.searchWords.some((w) =>
        c.title.toLowerCase().includes(w.toLowerCase())
      );
    });
  }, [props.searchWords, chats]);

  return (
    <>
      <div
        className={`${
          props.className ?? ''
        } flex flex-col items-start gap-0.5 overflow-x-hidden`}>
        {searchedChats.map((chat) => {
          const _chatId = decomposeId(chat.chatId);
          return (
            <ChatListItem
              key={_chatId}
              active={chatId === _chatId}
              chat={chat}
              onDelete={onDelete}
              onUpdateTitle={onUpdateTitle}
              onNavigate={props.onNavigate}
              highlightWords={props.searchWords}
            />
          );
        })}
        {canLoadMore && !loading && (
          <div className="my-2 flex w-full justify-center">
            <button
              className="rounded-lg px-2 py-1 text-[13px] text-[#969696] hover:bg-[#F7F7F7]"
              onClick={() => {
                loadMore();
              }}>
              {t('common.load_more')}
            </button>
          </div>
        )}
        {loading &&
          new Array(10)
            .fill('')
            .map((_, idx) => (
              <div
                key={idx}
                className="my-1 h-6 w-full animate-pulse rounded bg-[#F2F2F2]"></div>
            ))}
      </div>
    </>
  );
};

export default ChatList;
