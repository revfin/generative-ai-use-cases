import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import ButtonSend from './ButtonSend';
import Textarea from './Textarea';
import ZoomUpImage from './ZoomUpImage';
import ZoomUpVideo from './ZoomUpVideo';
import useChat from '../hooks/useChat';
import { useLocation } from 'react-router-dom';
import Button from './Button';
import ButtonIcon from './ButtonIcon';
import {
  PiArrowsCounterClockwise,
  PiPaperclip,
  PiSpinnerGap,
  PiSlidersHorizontal,
  PiLightbulbFilament,
} from 'react-icons/pi';
import useFiles from '../hooks/useFiles';
import FileCard from './FileCard';
import { FileLimit } from 'generative-ai-use-cases';
import { useTranslation } from 'react-i18next';
import useUserSetting from '../hooks/useUserSetting';
import Tooltip from './Tooltip';

type Props = {
  content: string;
  disabled?: boolean;
  placeholder?: string;
  description?: string;
  fullWidth?: boolean;
  resetDisabled?: boolean;
  loading?: boolean;
  isEmpty?: boolean;
  onChangeContent: (content: string) => void;
  onSend: () => void;
  sendIcon?: React.ReactNode;
  // When using it outside the bottom of the page, disable the margin bottom
  disableMarginBottom?: boolean;
  fileUpload?: boolean;
  fileLimit?: FileLimit;
  accept?: string[];
  canStop?: boolean;
  reasoning?: boolean;
  onReasoningSwitched?: () => void;
  reasoningEnabled?: boolean;
  // Quiet controls rendered in the trailing cluster, before the send button
  // (the model selector lives here)
  toolbar?: React.ReactNode;
} & (
  | {
      hideReset?: false;
      onReset: () => void;
    }
  | {
      hideReset: true;
    }
) & {
    setting?: boolean;
    onSetting?: () => void;
  };

const InputChatContent: React.FC<Props> = (props) => {
  const { t } = useTranslation();
  const { settingSubmitCmdOrCtrlEnter } = useUserSetting();
  const { pathname } = useLocation();
  const { loading: chatLoading, isEmpty: chatIsEmpty } = useChat(pathname);
  const {
    uploadedFiles,
    uploadFiles,
    checkFiles,
    deleteUploadedFile,
    uploading,
    errorMessages,
  } = useFiles(pathname);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // When the model is changed, etc., display the error message (do not automatically delete the file)
  useEffect(() => {
    if (props.fileLimit && props.accept) {
      checkFiles(props.fileLimit, props.accept);
    }
  }, [checkFiles, props.fileLimit, props.accept]);

  const onChangeFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && props.fileLimit && props.accept) {
      // Reflect the file and upload it
      uploadFiles(Array.from(files), props.fileLimit, props.accept);
    }
  };

  const deleteFile = useCallback(
    (fileId: string) => {
      if (props.fileLimit && props.accept) {
        deleteUploadedFile(fileId, props.fileLimit, props.accept);
      }
    },
    [deleteUploadedFile, props.fileLimit, props.accept]
  );
  const handlePaste = async (pasteEvent: React.ClipboardEvent) => {
    const fileList = pasteEvent.clipboardData.items || [];
    const files = Array.from(fileList)
      .filter((file) => file.kind === 'file')
      .map((file) => file.getAsFile() as File);
    if (files.length > 0 && props.fileLimit && props.accept) {
      // Upload the file
      uploadFiles(Array.from(files), props.fileLimit, props.accept);
      // Since the file name is also pasted when the file is pasted, stop the default behavior
      pasteEvent.preventDefault();
    }
    // If there is no file, stop the default behavior (paste text)
  };

  const loading = useMemo(() => {
    return props.loading === undefined ? chatLoading : props.loading;
  }, [chatLoading, props.loading]);

  const disabledSend = useMemo(() => {
    return (
      (!loading && props.content.trim() === '') ||
      props.disabled ||
      uploading ||
      errorMessages.length > 0
    );
  }, [props.content, props.disabled, uploading, errorMessages, loading]);

  return (
    <div className={`${props.fullWidth ? 'w-full' : 'w-full max-w-3xl px-4'}`}>
      {props.description && (
        <p className="m-2 whitespace-pre-wrap text-xs text-gray-500">
          {props.description}
        </p>
      )}
      <div
        className={`focus-within:border-aws-squid-ink/30 relative flex flex-col rounded-2xl border border-[#E8E8E8] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors ${
          props.disableMarginBottom
            ? ''
            : settingSubmitCmdOrCtrlEnter
              ? 'mb-2'
              : 'mb-6'
        }`}>
        <div className="flex grow flex-col">
          {props.fileUpload && uploadedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {uploadedFiles.map((uploadedFile, idx) => {
                if (uploadedFile.type === 'image') {
                  return (
                    <ZoomUpImage
                      key={idx}
                      src={uploadedFile.base64EncodedData}
                      loading={uploadedFile.uploading}
                      deleting={uploadedFile.deleting}
                      size="s"
                      error={uploadedFile.errorMessages.length > 0}
                      onDelete={() => {
                        deleteFile(uploadedFile.id ?? '');
                      }}
                    />
                  );
                } else if (uploadedFile.type === 'video') {
                  return (
                    <ZoomUpVideo
                      key={idx}
                      src={uploadedFile.base64EncodedData}
                      loading={uploadedFile.uploading}
                      deleting={uploadedFile.deleting}
                      size="s"
                      error={uploadedFile.errorMessages.length > 0}
                      onDelete={() => {
                        deleteFile(uploadedFile.id ?? '');
                      }}
                    />
                  );
                } else {
                  return (
                    <FileCard
                      key={idx}
                      filename={uploadedFile.name}
                      loading={uploadedFile.uploading}
                      deleting={uploadedFile.deleting}
                      size="s"
                      error={uploadedFile.errorMessages.length > 0}
                      onDelete={() => {
                        deleteFile(uploadedFile.id ?? '');
                      }}
                    />
                  );
                }
              })}
            </div>
          )}
          {errorMessages.length > 0 && (
            <div className="flex flex-col gap-1 px-4 pt-3">
              {errorMessages.map((errorMessage, idx) => (
                <p key={idx} className="text-[13px] text-red-600">
                  {errorMessage}
                </p>
              ))}
            </div>
          )}
          <Textarea
            className={`scrollbar-thumb-gray-200 scrollbar-thin bg-transparent px-4 pb-1 pt-3.5 text-[15px] placeholder:text-[#969696]`}
            placeholder={props.placeholder ?? t('common.enter_text')}
            noBorder
            notItem
            value={props.content}
            onChange={props.onChangeContent}
            onPaste={props.fileUpload ? handlePaste : undefined}
            onEnter={disabledSend ? undefined : props.onSend}
          />
        </div>
        <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
          <div className="flex min-w-0 items-center gap-x-1">
            {props.fileUpload && (
              <Tooltip
                message={t('inputs.attachment')}
                position="right"
                topPosition="-top-16"
                nowrap>
                <input
                  ref={fileInputRef}
                  hidden
                  onChange={onChangeFiles}
                  type="file"
                  accept={props.accept?.join(',')}
                  multiple
                  value={[]}
                />
                <button
                  type="button"
                  aria-label={t('inputs.attachment')}
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className={`focus-visible:ring-aws-squid-ink flex size-8 items-center justify-center rounded-lg text-lg transition-colors focus:outline-none focus-visible:ring-1 ${
                    uploading
                      ? 'text-[#C6C6C6]'
                      : uploadedFiles.length > 0
                        ? 'text-aws-squid-ink hover:bg-[#F7F7F7]'
                        : 'text-[#969696] hover:bg-[#F7F7F7] hover:text-[#5A5A5A]'
                  }`}>
                  {uploading ? (
                    <PiSpinnerGap className="animate-spin" />
                  ) : (
                    <PiPaperclip />
                  )}
                </button>
              </Tooltip>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-x-1">
            {props.reasoning && (
              <Tooltip
                message={t('inputs.reasoning_hint')}
                position="center"
                topPosition="-top-16"
                nowrap>
                <button
                  type="button"
                  aria-pressed={!!props.reasoningEnabled}
                  onClick={props.onReasoningSwitched ?? (() => {})}
                  className={`focus-visible:ring-aws-squid-ink flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] transition-colors focus:outline-none focus-visible:ring-1 ${
                    props.reasoningEnabled
                      ? 'text-aws-squid-ink bg-[#1C256C]/[0.07]'
                      : 'text-[#5A5A5A] hover:bg-[#F7F7F7]'
                  }`}>
                  <PiLightbulbFilament className="text-base" />
                  <span className="hidden sm:inline">
                    {t('inputs.reasoning')}
                  </span>
                </button>
              </Tooltip>
            )}
            {props.setting && (
              <Tooltip
                message={t('inputs.setting')}
                position="center"
                topPosition="-top-16"
                nowrap>
                <ButtonIcon
                  onClick={props.onSetting ?? (() => {})}
                  className="size-8 text-base text-[#969696] hover:text-[#5A5A5A]">
                  <PiSlidersHorizontal />
                </ButtonIcon>
              </Tooltip>
            )}
            {props.toolbar}
            <ButtonSend
              className="ml-1"
              disabled={disabledSend}
              loading={loading || uploading}
              onClick={props.onSend}
              icon={props.sendIcon}
              canStop={props.canStop}
            />
          </div>
        </div>

        {!(props.isEmpty ?? chatIsEmpty) &&
          !props.resetDisabled &&
          !props.hideReset && (
            <Button
              className="absolute -top-14 right-0 p-2 text-sm"
              outlined
              disabled={loading}
              onClick={props.onReset}>
              <PiArrowsCounterClockwise className="mr-2" />
              {t('common.start_over')}
            </Button>
          )}
      </div>

      {/* Show keyboard shortcut hint when cmd/ctrl+enter setting is enabled */}
      {settingSubmitCmdOrCtrlEnter && (
        <div className="mb-4 mt-1 text-right text-[11px] text-[#969696]">
          {navigator.platform.toLowerCase().includes('mac')
            ? t('chat.hint_cmd_enter')
            : t('chat.hint_ctrl_enter')}
        </div>
      )}
    </div>
  );
};

export default InputChatContent;
