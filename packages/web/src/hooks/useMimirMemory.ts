import { produce } from 'immer';
import useHttp from './useHttp';

/**
 * What Mimir remembers about the signed-in user, and the ability to forget
 * it - deliberately the same shape as `packages/cdk/lambda/mimirMemory.ts`.
 *
 * The route sits behind API Gateway's Cognito authorizer (see useHttp's
 * Authorization header), so there is no actor id to pass here - the server
 * derives it from the verified token, same as every other authed route.
 */

export type MimirMemoryRecord = {
  recordId: string;
  namespace: string;
  content: string;
  createdAt: string | null;
};

type ListMimirMemoryResponse = {
  records: MimirMemoryRecord[];
};

type WipeMimirMemoryResponse = {
  deletedRecords: number;
};

const useMimirMemory = () => {
  const http = useHttp();

  const { data, error, isLoading, mutate } =
    http.get<ListMimirMemoryResponse>('mimir-memory');

  const records = data?.records ?? [];

  const deleteMemory = async (recordId: string) => {
    // Optimistic removal - the row disappears immediately, and a failed
    // request re-fetches to put it back.
    mutate(
      produce(data, (draft) => {
        if (draft) {
          draft.records = draft.records.filter(
            (record) => record.recordId !== recordId
          );
        }
      }),
      { revalidate: false }
    );

    return http.delete<void>(`mimir-memory/${recordId}`).finally(() => {
      mutate();
    });
  };

  const forgetEverything = async (): Promise<number> => {
    mutate(
      produce(data, (draft) => {
        if (draft) {
          draft.records = [];
        }
      }),
      { revalidate: false }
    );

    return http
      .delete<WipeMimirMemoryResponse>('mimir-memory')
      .then((res) => res.data.deletedRecords)
      .finally(() => {
        mutate();
      });
  };

  return {
    records,
    loading: isLoading,
    error,
    mutate,
    deleteMemory,
    forgetEverything,
  };
};

export default useMimirMemory;
