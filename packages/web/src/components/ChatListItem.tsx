import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BaseProps } from '../@types/common';
import { Link } from 'react-router-dom';
import { PiCheck, PiPencilLine, PiTrash, PiX } from 'react-icons/pi';
import ButtonIcon from './ButtonIcon';
import { Chat } from 'generative-ai-use-cases';
import { decomposeId } from '../utils/ChatUtils';
import DialogConfirmDeleteChat from './DialogConfirmDeleteChat';

type Props = BaseProps & {
  active: boolean;
  chat: Chat;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDelete: (chatId: string) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdateTitle: (chatId: string, title: string) => Promise<any>;
  onNavigate?: () => void;
  highlightWords: string[];
};

const ChatListItem: React.FC<Props> = (props) => {
  const [openDialog, setOpenDialog] = useState(false);
  const [editing, setEditing] = useState(false);
  const chatId = useMemo(() => {
    return decomposeId(props.chat.chatId) ?? '';
  }, [props.chat.chatId]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [tempTitle, setTempTitle] = useState('');

  useEffect(() => {
    if (editing) {
      setTempTitle(props.chat.title);
    }
  }, [editing, props.chat.title]);

  const updateTitle = useCallback(() => {
    setEditing(false);
    props.onUpdateTitle(chatId, tempTitle).catch(() => {
      setEditing(true);
    });
  }, [chatId, props, tempTitle]);

  useLayoutEffect(() => {
    if (editing) {
      const listener = (e: DocumentEventMap['keypress']) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();

          // Update Title in dispatch process (to synchronize)
          setTempTitle((newTitle) => {
            setEditing(false);
            props.onUpdateTitle(chatId, newTitle).catch(() => {
              setEditing(true);
            });
            return newTitle;
          });
        }
      };
      inputRef.current?.addEventListener('keypress', listener);

      inputRef.current?.focus();

      return () => {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        inputRef.current?.removeEventListener('keypress', listener);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const highlightText = useCallback((text: string, words: string[]) => {
    if (words.length === 0) return text;

    const regex = new RegExp(`(${words.join('|')})`, 'gi');
    return text.split(regex).map((part, i) => {
      if (words.some((word) => part.toLowerCase() === word.toLowerCase())) {
        return (
          <span key={i} className="text-aws-smile font-medium">
            {part}
          </span>
        );
      }
      return part;
    });
  }, []);

  return (
    <>
      {openDialog && (
        <DialogConfirmDeleteChat
          isOpen={openDialog}
          target={props.chat}
          onDelete={() => {
            setOpenDialog(false);
            props.onDelete(chatId);
          }}
          onClose={() => {
            setOpenDialog(false);
          }}
        />
      )}
      <Link
        className={`group flex h-9 w-full items-center justify-start rounded-lg px-2 text-[13px] ${
          props.active
            ? 'text-aws-squid-ink bg-[#FFF7F2] font-medium'
            : 'hover:bg-[#F7F7F7]'
        } ${props.className ?? ''}`}
        to={`/chat/${chatId}`}
        onClick={props.onNavigate}>
        <div className="flex w-full items-center justify-start overflow-hidden">
          <div className="relative flex-1 truncate">
            {editing ? (
              <input
                ref={inputRef}
                type="text"
                className="max-h-5 w-full bg-transparent p-0 text-[13px] ring-0"
                value={tempTitle}
                onChange={(e) => {
                  setTempTitle(e.target.value);
                }}
              />
            ) : (
              <div className="truncate">
                {highlightText(props.chat.title, props.highlightWords)}
              </div>
            )}
          </div>
          <div className="flex text-[#969696]">
            {props.active && !editing && (
              <>
                <ButtonIcon
                  className="text-base"
                  onClick={() => {
                    setEditing(true);
                  }}>
                  <PiPencilLine />
                </ButtonIcon>
                <ButtonIcon
                  className="text-base"
                  onClick={() => {
                    setOpenDialog(true);
                  }}>
                  <PiTrash />
                </ButtonIcon>
              </>
            )}
            {editing && (
              <>
                <ButtonIcon className="text-base" onClick={updateTitle}>
                  <PiCheck />
                </ButtonIcon>

                <ButtonIcon
                  className="text-base"
                  onClick={() => {
                    setEditing(false);
                  }}>
                  <PiX />
                </ButtonIcon>
              </>
            )}
          </div>
        </div>
      </Link>
    </>
  );
};

export default ChatListItem;
