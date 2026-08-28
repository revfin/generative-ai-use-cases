import useVersion from '../hooks/useVersion';
import useUserSetting from '../hooks/useUserSetting';
import Help from '../components/Help';
import Button from '../components/Button';
import Switch from '../components/Switch';
import { MODELS } from '../hooks/useModel';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useCallback, useState } from 'react';
import { useSWRConfig } from 'swr';
import { useTranslation } from 'react-i18next';
import { supportedLngs } from '../i18n/config';
import useChatList from '../hooks/useChatList';
import DialogConfirmDeleteAllChats from '../components/DialogConfirmDeleteAllChats';

const ragKnowledgeBaseEnabled: boolean =
  import.meta.env.VITE_APP_RAG_KNOWLEDGE_BASE_ENABLED === 'true';
const ragKnowledgeBaseStorageType: string =
  import.meta.env.VITE_APP_RAG_KNOWLEDGE_BASE_STORAGE_TYPE || 'opensearch';

const SettingItem = (props: {
  name: string;
  value: string | React.ReactNode;
  helpMessage?: string;
  top?: boolean;
}) => {
  return (
    <div
      className={`grid grid-cols-12 border-solid border-[#EFEFEF] px-1 py-3 hover:bg-[#FAFAFA] ${props.top ? 'border-y' : 'border-b'}`}>
      <div className="col-span-4 flex items-center justify-start">
        {props.name}
        {props.helpMessage && <Help message={props.helpMessage} />}
      </div>
      <div className="col-span-8 flex items-center justify-end">
        {props.value}
      </div>
    </div>
  );
};

const Setting = () => {
  const { modelRegion, modelIds } = MODELS;
  const { cache } = useSWRConfig();
  const { getLocalVersion } = useVersion();
  const { signOut } = useAuthenticator();
  const { i18n, t } = useTranslation();
  const { deleteAllChats } = useChatList();
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false);

  const localVersion = getLocalVersion();
  const {
    settingSubmitCmdOrCtrlEnter,
    setSettingSubmitCmdOrCtrlEnter,
    settingTypingAnimation,
    setSettingTypingAnimation,
    settingShowEmail,
    setSettingShowEmail,
  } = useUserSetting();

  const onClickSignout = useCallback(() => {
    // Delete all SWR cache
    for (const key of cache.keys()) {
      cache.delete(key);
    }
    signOut();
  }, [cache, signOut]);

  const onClickDeleteAllChats = useCallback(async () => {
    try {
      await deleteAllChats();
      setIsDeleteAllDialogOpen(false);
    } catch (error) {
      console.error('Failed to delete all chats:', error);
    }
  }, [deleteAllChats]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-24 pt-8">
      <div className="mb-4 text-lg font-semibold">{t('setting.user')}</div>

      <div className="text-sm">
        <SettingItem
          name={t('setting.items.language')}
          value={
            <select
              value={i18n.resolvedLanguage}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="rounded-lg border-[#E8E8E8] py-1 pr-8 text-sm focus:border-[#E8E8E8] focus:outline-none focus:ring-0">
              {Object.entries(supportedLngs).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          }
          helpMessage={t('setting.items.language_help')}
          top={true}
        />

        <SettingItem
          name={t('setting.items.line_break_enter')}
          value={
            <Switch
              checked={settingSubmitCmdOrCtrlEnter}
              label=""
              onSwitch={setSettingSubmitCmdOrCtrlEnter}
            />
          }></SettingItem>

        <SettingItem
          name={t('setting.items.typing_animation')}
          value={
            <Switch
              checked={settingTypingAnimation}
              label=""
              onSwitch={setSettingTypingAnimation}
            />
          }></SettingItem>

        <SettingItem
          name={t('setting.items.show_email')}
          value={
            <Switch
              checked={settingShowEmail}
              label=""
              onSwitch={setSettingShowEmail}
            />
          }></SettingItem>

        <SettingItem
          name={t('setting.items.delete_all_chats')}
          value={
            <Button
              onClick={() => setIsDeleteAllDialogOpen(true)}
              className="border-red-500 bg-red-500 text-white">
              {t('setting.items.delete_all_chats_button')}
            </Button>
          }></SettingItem>

        <SettingItem
          name={t('setting.items.login_status')}
          value={
            <Button onClick={onClickSignout}>{t('setting.signout')}</Button>
          }></SettingItem>
      </div>

      <div className="mb-4 mt-10 text-lg font-semibold">
        {t('setting.system')}
      </div>

      <div className="text-sm">
        <SettingItem
          name={t('setting.items.version')}
          value={localVersion || t('common.not_available')}
          helpMessage={t('setting.items.version_help')}
          top={true}
        />
        <SettingItem
          name={t('setting.items.rag_kb_enabled')}
          value={
            ragKnowledgeBaseEnabled
              ? `true (${ragKnowledgeBaseStorageType === 's3vectors' ? 'Amazon S3 Vectors' : 'OpenSearch Serverless'})`
              : 'false'
          }
        />
        <SettingItem
          name={t('setting.ai_items.llm_model')}
          value={modelIds.join(', ')}
        />
        <SettingItem
          name={t('setting.ai_items.model_region')}
          value={modelRegion}
        />
      </div>

      <DialogConfirmDeleteAllChats
        isOpen={isDeleteAllDialogOpen}
        onDelete={onClickDeleteAllChats}
        onClose={() => setIsDeleteAllDialogOpen(false)}
      />
    </div>
  );
};

export default Setting;
