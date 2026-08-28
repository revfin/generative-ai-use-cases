import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useParams } from 'react-router-dom';
import InputChatContent from '../components/InputChatContent';
import useChat from '../hooks/useChat';
import useChatApi from '../hooks/useChatApi';
import useChatList from '../hooks/useChatList';
import ChatMessage from '../components/ChatMessage';
import Button from '../components/Button';
import ButtonCopy from '../components/ButtonCopy';
import ModalDialog from '../components/ModalDialog';
import Select from '../components/Select';
import ScrollTopBottom from '../components/ScrollTopBottom';
import useFollow from '../hooks/useFollow';
import { PiBooks, PiShareFat } from 'react-icons/pi';
import { create } from 'zustand';
import useBranding from '../hooks/useBranding';
import { ChatPageQueryParams } from '../@types/navigate';
import { MODELS } from '../hooks/useModel';
import { getPrompter } from '../prompts';
import queryString from 'query-string';
import useFiles from '../hooks/useFiles';
import {
  AdditionalModelRequestFields,
  FileLimit,
} from 'generative-ai-use-cases';
import ModelParameters from '../components/ModelParameters';
import { AcceptedDotExtensions } from '../utils/MediaUtils';
import { useTranslation } from 'react-i18next';

// File size limits for Chat (Lambda route: API Gateway → Lambda → Bedrock Converse API)
// - Lambda synchronous payload limit: 6MB
// - File data is base64-encoded in the request, so max original file size ≈ 6MB / 1.33 ≈ 4.5MB
// - Bedrock Converse API document limit: 4.5MB per document (except Claude 4+ PDF and Nova PDF/DOCX)
const fileLimit: FileLimit = {
  accept: AcceptedDotExtensions,
  maxFileCount: 5,
  maxFileSizeMB: 4.5,
  maxImageFileCount: 20,
  maxImageFileSizeMB: 3.75,
  maxVideoFileCount: 1,
  maxVideoFileSizeMB: 1000, // 1 GB for S3 input
};

// Knowledge Base retrieval is the default behaviour of the chat when the
// stack was deployed with a knowledge base. RetrieveAndGenerate can only use
// models deployed in the model region, so without one there is nothing to
// answer with.
const knowledgeBaseAvailable: boolean =
  import.meta.env.VITE_APP_RAG_KNOWLEDGE_BASE_ENABLED === 'true' &&
  MODELS.modelIdsInModelRegion.length > 0;

type StateType = {
  content: string;
  sessionId: string | undefined;
  useKnowledgeBase: boolean;
  setContent: (c: string) => void;
  setSessionId: (c: string | undefined) => void;
  setUseKnowledgeBase: (b: boolean) => void;
};

const useChatPageState = create<StateType>((set) => {
  return {
    content: '',
    // RetrieveAndGenerate owns the session, so it starts empty and is filled
    // from the streaming response
    sessionId: undefined,
    useKnowledgeBase: knowledgeBaseAvailable,
    setContent: (s: string) => {
      set(() => ({
        content: s,
      }));
    },
    setSessionId: (s: string | undefined) => {
      set(() => ({
        sessionId: s,
      }));
    },
    setUseKnowledgeBase: (b: boolean) => {
      set(() => ({
        useKnowledgeBase: b,
      }));
    },
  };
});

const DEFAULT_REASONING_BUDGET = 4096; // Claude 3.7 Sonnet recommended minimum value

const ChatPage: React.FC = () => {
  const {
    content,
    sessionId,
    useKnowledgeBase,
    setContent,
    setSessionId,
    setUseKnowledgeBase,
  } = useChatPageState();
  const { pathname, search, state } = useLocation();
  const {
    clear: clearFiles,
    uploadedFiles,
    uploadFiles,
    base64Cache,
  } = useFiles(pathname);
  const { chatId } = useParams();
  const { t } = useTranslation();
  const { logoPath } = useBranding();

  const {
    getModelId,
    setModelId,
    loading,
    writing,
    loadingMessages,
    isEmpty,
    messages,
    clear,
    postChat,
    editChat,
    updateSystemContextByModel,
    retryGeneration,
    forceToStop,
  } = useChat(pathname, chatId);
  const { createShareId, findShareId, deleteShareId } = useChatApi();
  const { scrollableContainer, setFollowing } = useFollow();
  const { getChatTitle } = useChatList();
  const { modelDisplayName } = MODELS;
  const { data: share, mutate: reloadShare } = findShareId(chatId);
  const modelId = getModelId();
  const prompter = useMemo(() => {
    return getPrompter(modelId);
  }, [modelId]);
  const [overrideModelParameters, setOverrideModelParameters] =
    useState<AdditionalModelRequestFields>({
      reasoningConfig: {
        type: 'disabled',
        budgetTokens: DEFAULT_REASONING_BUDGET,
      },
    });
  const [showSetting, setShowSetting] = useState(false);

  // Knowledge Base answers are generated in the model region only
  const availableModels = useMemo(() => {
    return useKnowledgeBase ? MODELS.modelIdsInModelRegion : MODELS.allModelIds;
  }, [useKnowledgeBase]);

  useEffect(() => {
    // On the conversation history page, do not change the system prompt even if the model is changed
    if (!chatId) {
      updateSystemContextByModel();
    }
    // eslint-disable-next-line  react-hooks/exhaustive-deps
  }, [prompter]);

  const title = useMemo(() => {
    if (chatId) {
      return getChatTitle(chatId) || t('chat.title');
    } else {
      return t('chat.new_chat');
    }
  }, [chatId, getChatTitle, t]);

  const accept = useMemo(() => {
    if (!modelId) return [];
    const feature = MODELS.getModelMetadata(modelId);
    return [
      ...(feature.flags.doc ? fileLimit.accept.doc : []),
      ...(feature.flags.image ? fileLimit.accept.image : []),
      ...(feature.flags.video ? fileLimit.accept.video : []),
    ];
  }, [modelId]);
  const fileUpload = useMemo(() => {
    // RetrieveAndGenerate only takes the question text, so attachments are
    // offered on the direct-model path only
    return accept.length > 0 && !useKnowledgeBase;
  }, [accept, useKnowledgeBase]);
  const reasoning = useMemo(() => {
    return (
      !useKnowledgeBase &&
      (MODELS.getModelMetadata(modelId).flags.reasoning ?? false)
    );
  }, [modelId, useKnowledgeBase]);
  const adaptiveThinking = useMemo(() => {
    return MODELS.getModelMetadata(modelId).flags.adaptiveThinking ?? false;
  }, [modelId]);
  const adaptiveThinkingAlwaysOn = useMemo(() => {
    return (
      MODELS.getModelMetadata(modelId).flags.adaptiveThinkingAlwaysOn ?? false
    );
  }, [modelId]);
  const xhighEffort = useMemo(() => {
    return MODELS.getModelMetadata(modelId).flags.xhighEffort ?? false;
  }, [modelId]);
  const reasoningEnabled = useMemo(() => {
    return (
      overrideModelParameters.reasoningConfig.type === 'enabled' ||
      overrideModelParameters.reasoningConfig.type === 'adaptive'
    );
  }, [overrideModelParameters]);
  // Currently, the settings modal is only used with the reasoning option
  const setting = useMemo(() => {
    return reasoning;
  }, [reasoning]);

  // Whether reasoning was force-enabled by an always-on model while the
  // user had it disabled, so the disabled state can be restored later
  const reasoningForcedByAlwaysOn = useRef(false);

  // When model changes, update reasoning type if reasoning is already enabled.
  // For models whose adaptive thinking is always on (e.g. Claude Sonnet 5),
  // reasoning is force-enabled while the model is selected, and the user's
  // original disabled state is restored when switching away.
  useEffect(() => {
    setOverrideModelParameters((prev) => {
      const config = prev.reasoningConfig;
      const enabled = config.type === 'enabled' || config.type === 'adaptive';

      let newType = config.type;
      if (adaptiveThinkingAlwaysOn) {
        if (!enabled) {
          reasoningForcedByAlwaysOn.current = true;
        }
        newType = 'adaptive';
      } else if (reasoningForcedByAlwaysOn.current) {
        reasoningForcedByAlwaysOn.current = false;
        newType = 'disabled';
      } else if (enabled) {
        newType = adaptiveThinking ? 'adaptive' : 'enabled';
      }

      const newEffort =
        config.effort === 'xhigh' && !xhighEffort ? 'high' : config.effort;
      if (config.type === newType && config.effort === newEffort) {
        return prev;
      }
      return {
        ...prev,
        reasoningConfig: { ...config, type: newType, effort: newEffort },
      };
    });
  }, [adaptiveThinking, adaptiveThinkingAlwaysOn, xhighEffort]);

  useEffect(() => {
    const _modelId = !modelId ? availableModels[0] : modelId;

    if (search !== '') {
      const params = queryString.parse(search) as ChatPageQueryParams;
      setContent(params.content ?? '');
      setModelId(
        availableModels.includes(params.modelId ?? '')
          ? params.modelId!
          : _modelId
      );
    } else {
      setModelId(_modelId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, setContent, availableModels, pathname]);

  // Keep the selection valid when the answer source changes the model list
  useEffect(() => {
    if (modelId && !availableModels.includes(modelId)) {
      setModelId(availableModels[0]);
      setSessionId(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableModels, modelId]);

  // "New chat" in the sidebar lands here with a marker in the history state
  useEffect(() => {
    if ((state as { newChat?: number } | null)?.newChat) {
      clear();
      setContent('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // A cleared conversation (e.g. "New chat") must not reuse the previous
  // knowledge base session
  useEffect(() => {
    if (isEmpty && sessionId) {
      setSessionId(undefined);
    }
  }, [isEmpty, sessionId, setSessionId]);

  const onSend = useCallback(async () => {
    setFollowing(true);
    const savedContent = content;
    setContent('');
    clearFiles();
    const success = await postChat(
      prompter.chatPrompt({ content: savedContent }),
      false,
      undefined,
      undefined,
      useKnowledgeBase ? sessionId : undefined,
      fileUpload ? uploadedFiles : undefined,
      undefined,
      useKnowledgeBase ? 'bedrockKb' : undefined,
      setSessionId,
      base64Cache,
      useKnowledgeBase ? undefined : overrideModelParameters
    );
    if (!success) {
      setContent(savedContent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    content,
    base64Cache,
    fileUpload,
    setFollowing,
    overrideModelParameters,
    uploadedFiles,
    useKnowledgeBase,
    sessionId,
  ]);

  const onRetry = useCallback(() => {
    retryGeneration(
      undefined,
      undefined,
      undefined,
      useKnowledgeBase ? sessionId : undefined,
      undefined,
      undefined,
      useKnowledgeBase ? 'bedrockKb' : undefined,
      setSessionId,
      base64Cache,
      useKnowledgeBase ? undefined : overrideModelParameters
    );
  }, [
    retryGeneration,
    base64Cache,
    overrideModelParameters,
    useKnowledgeBase,
    sessionId,
    setSessionId,
  ]);

  const onStop = useCallback(() => {
    forceToStop();
  }, [forceToStop]);

  const onEdit = useCallback(
    (modifiedPrompt: string) => {
      setFollowing(true);
      editChat(
        modifiedPrompt,
        false,
        undefined,
        undefined,
        useKnowledgeBase ? sessionId : undefined,
        undefined,
        undefined,
        useKnowledgeBase ? 'bedrockKb' : undefined,
        setSessionId,
        base64Cache,
        useKnowledgeBase ? undefined : overrideModelParameters
      );
    },
    [
      editChat,
      base64Cache,
      setFollowing,
      overrideModelParameters,
      useKnowledgeBase,
      sessionId,
      setSessionId,
    ]
  );

  const onSwitchKnowledgeBase = useCallback(() => {
    setUseKnowledgeBase(!useKnowledgeBase);
    setSessionId(undefined);
    clearFiles();
  }, [useKnowledgeBase, setUseKnowledgeBase, setSessionId, clearFiles]);

  const [creatingShareId, setCreatingShareId] = useState(false);
  const [deletingShareId, setDeletingShareId] = useState(false);
  const [showShareIdModal, setShowShareIdModal] = useState(false);
  const [isOver, setIsOver] = useState(false);

  const onCreateShareId = useCallback(async () => {
    try {
      setCreatingShareId(true);
      await createShareId(chatId!);
      reloadShare();
    } catch (e) {
      console.error(e);
    } finally {
      setCreatingShareId(false);
    }
  }, [chatId, createShareId, reloadShare]);

  const onDeleteShareId = useCallback(async () => {
    try {
      setDeletingShareId(true);
      await deleteShareId(share!.shareId.split('#')[1]);
      reloadShare();
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingShareId(false);
    }
  }, [share, deleteShareId, reloadShare]);

  const shareLink = useMemo(() => {
    if (share) {
      return `${window.location.origin}/share/${share.shareId.split('#')[1]}`;
    } else {
      return null;
    }
  }, [share]);

  const handleDragOver = (event: React.DragEvent) => {
    // When a file is dragged, display the overlay
    event.preventDefault();
    setIsOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    // When a file is dragged, hide the overlay
    event.preventDefault();
    setIsOver(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    // When a file is dropped, add the file
    event.preventDefault();
    setIsOver(false);
    if (event.dataTransfer.files) {
      // Reflect the file and upload it
      uploadFiles(Array.from(event.dataTransfer.files), fileLimit, accept);
    }
  };

  return (
    <>
      <div
        onDragOver={fileUpload ? handleDragOver : undefined}
        className="relative pb-44">
        <div className="invisible sticky top-0 z-10 h-0 border-[#EFEFEF] bg-white/90 backdrop-blur lg:visible lg:flex lg:h-14 lg:items-center lg:justify-between lg:border-b lg:px-6 print:hidden">
          <div className="truncate text-sm font-medium">{title}</div>
          {chatId && (
            <button
              className="ml-4 flex flex-none items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-[#5A5A5A] hover:bg-[#F7F7F7]"
              onClick={() => {
                setShowShareIdModal(true);
              }}>
              <PiShareFat />
              {share ? <>{t('chat.sharing')}</> : <>{t('chat.share')}</>}
            </button>
          )}
        </div>

        {isOver && fileUpload && (
          <div
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="fixed bottom-0 left-0 right-0 top-0 z-[999] bg-white/90 p-10 text-center">
            <div className="border-aws-squid-ink/30 text-aws-squid-ink flex h-full w-full items-center justify-center rounded-2xl border border-dashed">
              <div className="font-medium">{t('chat.drop_files')}</div>
            </div>
          </div>
        )}

        {(isEmpty || loadingMessages) && (
          <div className="flex h-[calc(100vh-20rem)] flex-col items-center justify-center gap-y-4 px-4 text-center">
            {logoPath ? (
              <img
                src={logoPath}
                alt=""
                className={`size-12 rounded-xl ${loadingMessages ? 'animate-pulse' : ''}`}
              />
            ) : null}
            {!loadingMessages && (
              <>
                <div className="text-aws-font-color text-2xl font-medium">
                  {t('chat.empty_greeting')}
                </div>
                <div className="text-[13px] text-[#969696]">
                  {useKnowledgeBase
                    ? t('chat.empty_hint_documents')
                    : t('chat.empty_hint')}
                </div>
              </>
            )}
          </div>
        )}

        <div ref={scrollableContainer} className="pt-4">
          {!isEmpty &&
            !loadingMessages &&
            messages.map((chat, idx) => (
              <ChatMessage
                key={idx}
                idx={idx}
                chatContent={chat}
                loading={loading && idx === messages.length - 1}
                allowRetry={idx === messages.length - 1}
                editable={idx === messages.length - 2 && !loading}
                onCommitEdit={
                  idx === messages.length - 2 && !loading ? onEdit : undefined
                }
                retryGeneration={onRetry}
              />
            ))}
        </div>

        <div className="fixed right-4 top-[calc(50vh-2rem)] z-0 lg:right-8">
          <ScrollTopBottom />
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-0 flex flex-col items-center justify-center bg-gradient-to-t from-white via-white to-transparent pt-8 lg:left-72 print:hidden">
          <InputChatContent
            content={content}
            disabled={loading && !writing}
            onChangeContent={setContent}
            onSend={() => {
              if (!loading) {
                onSend();
              } else {
                onStop();
              }
            }}
            hideReset={true}
            fileUpload={fileUpload}
            fileLimit={fileLimit}
            accept={accept}
            reasoning={reasoning && !adaptiveThinkingAlwaysOn}
            onReasoningSwitched={() => {
              setOverrideModelParameters({
                ...overrideModelParameters,
                reasoningConfig: {
                  ...overrideModelParameters.reasoningConfig,
                  type: reasoningEnabled
                    ? 'disabled'
                    : adaptiveThinking
                      ? 'adaptive'
                      : 'enabled',
                },
              });
            }}
            reasoningEnabled={reasoningEnabled}
            setting={setting}
            onSetting={() => {
              setShowSetting(true);
            }}
            canStop={writing}
            toolbar={
              <>
                {knowledgeBaseAvailable && (
                  <button
                    className={`flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] ${
                      useKnowledgeBase
                        ? 'text-aws-smile bg-aws-rind'
                        : 'text-[#969696] hover:bg-[#F7F7F7]'
                    }`}
                    aria-pressed={useKnowledgeBase}
                    onClick={onSwitchKnowledgeBase}>
                    <PiBooks className="text-base" />
                    <span className="hidden sm:inline">
                      {t('chat.answer_from_documents')}
                    </span>
                  </button>
                )}
                <div className="relative min-w-0">
                  <Select
                    quiet
                    notItem
                    value={modelId}
                    onChange={setModelId}
                    options={availableModels.map((m) => {
                      return { value: m, label: modelDisplayName(m) };
                    })}
                  />
                </div>
              </>
            }
          />
        </div>
      </div>

      <ModalDialog
        isOpen={showShareIdModal}
        title={t('chat.share_conversation')}
        onClose={() => {
          setShowShareIdModal(false);
        }}>
        <div className="py-3 text-[13px] text-[#5A5A5A]">
          {share ? (
            <>{t('chat.delete_link_message')}</>
          ) : (
            <>{t('chat.create_link_message')}</>
          )}
        </div>
        {shareLink && (
          <div className="my-2 flex flex-row items-center justify-between rounded-lg border border-[#E8E8E8] bg-[#F7F7F7] px-3 py-2">
            <div className="break-all text-[13px]">{shareLink}</div>
            <ButtonCopy text={shareLink} />
          </div>
        )}
        <div className="flex justify-end py-3">
          {share ? (
            <div className="flex">
              <Button
                onClick={() => {
                  window.open(shareLink!, '_blank', 'noreferrer');
                }}
                outlined
                className="mr-1"
                loading={deletingShareId}>
                {t('chat.open_link')}
              </Button>
              <Button
                onClick={onDeleteShareId}
                loading={deletingShareId}
                className="border-red-500 bg-red-500">
                {t('chat.delete_link')}
              </Button>
            </div>
          ) : (
            <Button onClick={onCreateShareId} loading={creatingShareId}>
              {t('chat.create_link')}
            </Button>
          )}
        </div>
      </ModalDialog>
      <ModalDialog
        isOpen={showSetting}
        onClose={() => {
          setShowSetting(false);
        }}
        title={t('chat.advanced_options')}>
        {setting && (
          <ModelParameters
            modelFeatureFlags={MODELS.getModelMetadata(modelId).flags}
            overrideModelParameters={overrideModelParameters}
            setOverrideModelParameters={setOverrideModelParameters}
          />
        )}
        <div className="mt-4 flex justify-end">
          <Button
            onClick={() => {
              setShowSetting(false);
            }}>
            {t('chat.settings')}
          </Button>
        </div>
      </ModalDialog>
    </>
  );
};

export default ChatPage;
