import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { PiSpinnerGap, PiTrash, PiCheck, PiX } from 'react-icons/pi';
import Button from './Button';
import ModalDialog from './ModalDialog';
import useMimirMemory, { MimirMemoryRecord } from '../hooks/useMimirMemory';

/**
 * The signed-in user's own "what Mimir remembers about me" panel — the same
 * idea as claude.ai / ChatGPT's memory manager, scoped to this app's two
 * long-term-memory namespaces (preferences, facts). It never touches chat
 * history: that lives in DynamoDB and has its own delete-all affordance
 * elsewhere on this page.
 */

const isPreferences = (namespace: string) =>
  namespace.toLowerCase().includes('preferences');
const isFacts = (namespace: string) =>
  namespace.toLowerCase().includes('facts');

const relativeTime = (createdAt: string | null): string | null => {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return formatDistanceToNow(date, { addSuffix: true });
};

const MemoryRow: React.FC<{
  record: MimirMemoryRecord;
  onDelete: (recordId: string) => Promise<unknown>;
}> = ({ record, onDelete }) => {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onConfirm = useCallback(async () => {
    setDeleting(true);
    try {
      await onDelete(record.recordId);
    } catch {
      toast.error(t('memory.delete_failed'));
      setDeleting(false);
      setConfirming(false);
    }
  }, [onDelete, record.recordId, t]);

  const time = relativeTime(record.createdAt);

  return (
    <div className="group flex items-center justify-between gap-3 border-b border-solid border-[#EFEFEF] px-1 py-3 last:border-b-0 hover:bg-[#FAFAFA]">
      <div className="min-w-0 flex-1">
        <div className="text-aws-font-color break-words text-sm">
          {record.content}
        </div>
        {time && <div className="mt-1 text-xs text-[#969696]">{time}</div>}
      </div>

      {confirming ? (
        <div className="flex flex-none items-center gap-2">
          <span className="text-xs text-[#969696]">
            {t('memory.delete_confirmation')}
          </span>
          <button
            aria-label={t('common.delete')}
            disabled={deleting}
            onClick={onConfirm}
            className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-30">
            {deleting ? <PiSpinnerGap className="animate-spin" /> : <PiCheck />}
          </button>
          <button
            aria-label={t('common.cancel')}
            disabled={deleting}
            onClick={() => setConfirming(false)}
            className="rounded p-1 text-[#969696] hover:bg-black/5 disabled:opacity-30">
            <PiX />
          </button>
        </div>
      ) : (
        <button
          aria-label={t('common.delete')}
          onClick={() => setConfirming(true)}
          className="flex-none rounded p-1 text-[#969696] opacity-0 hover:bg-black/5 hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100">
          <PiTrash />
        </button>
      )}
    </div>
  );
};

const MemoryGroup: React.FC<{
  title: string;
  records: MimirMemoryRecord[];
  onDelete: (recordId: string) => Promise<unknown>;
}> = ({ title, records, onDelete }) => {
  if (records.length === 0) return null;

  return (
    <div className="mt-6 first:mt-0">
      <div className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-[#969696]">
        {title}
      </div>
      <div className="border-y border-solid border-[#EFEFEF]">
        {records.map((record) => (
          <MemoryRow
            key={record.recordId}
            record={record}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
};

const MimirMemoryPanel: React.FC = () => {
  const { t } = useTranslation();
  const { records, loading, error, deleteMemory, forgetEverything } =
    useMimirMemory();
  const [isForgetDialogOpen, setIsForgetDialogOpen] = useState(false);
  const [forgetting, setForgetting] = useState(false);

  const preferences = useMemo(
    () => records.filter((r) => isPreferences(r.namespace)),
    [records]
  );
  const facts = useMemo(
    () => records.filter((r) => isFacts(r.namespace)),
    [records]
  );
  const other = useMemo(
    () =>
      records.filter(
        (r) => !isPreferences(r.namespace) && !isFacts(r.namespace)
      ),
    [records]
  );

  const onDelete = useCallback(
    (recordId: string) => deleteMemory(recordId),
    [deleteMemory]
  );

  const onForgetEverything = useCallback(async () => {
    setForgetting(true);
    try {
      const deletedRecords = await forgetEverything();
      setIsForgetDialogOpen(false);
      toast.success(t('memory.forget_all_success', { count: deletedRecords }));
    } catch {
      toast.error(t('memory.forget_all_failed'));
    } finally {
      setForgetting(false);
    }
  }, [forgetEverything, t]);

  return (
    <div>
      <div className="mb-4 mt-10 flex items-center justify-between">
        <div className="text-lg font-semibold">{t('memory.title')}</div>
        {records.length > 0 && (
          <Button
            outlined
            onClick={() => setIsForgetDialogOpen(true)}
            className="border-red-500 p-2 text-red-500">
            {t('memory.forget_all_button')}
          </Button>
        )}
      </div>

      <div className="text-sm text-[#969696]">{t('memory.description')}</div>

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-[#969696]">
          <PiSpinnerGap className="animate-spin" />
          {t('common.loading')}
        </div>
      )}

      {!loading && error && (
        <div className="mt-4 text-sm text-red-500">
          {t('memory.load_failed')}
        </div>
      )}

      {!loading && !error && records.length === 0 && (
        <div className="mt-4 text-sm text-[#969696]">{t('memory.empty')}</div>
      )}

      {!loading && !error && records.length > 0 && (
        <div className="mt-2">
          <MemoryGroup
            title={t('memory.preferences')}
            records={preferences}
            onDelete={onDelete}
          />
          <MemoryGroup
            title={t('memory.facts')}
            records={facts}
            onDelete={onDelete}
          />
          <MemoryGroup
            title={t('memory.other')}
            records={other}
            onDelete={onDelete}
          />
        </div>
      )}

      <ModalDialog
        isOpen={isForgetDialogOpen}
        title={t('memory.forget_all_button')}
        onClose={() => setIsForgetDialogOpen(false)}>
        <div>{t('memory.forget_all_confirmation')}</div>

        <div className="mt-4 flex justify-end gap-2">
          <Button
            outlined
            onClick={() => setIsForgetDialogOpen(false)}
            className="p-2">
            {t('common.cancel')}
          </Button>
          <Button
            loading={forgetting}
            onClick={onForgetEverything}
            className="bg-red-500 p-2 text-white">
            {t('memory.forget_all_button')}
          </Button>
        </div>
      </ModalDialog>
    </div>
  );
};

export default MimirMemoryPanel;
