import { useCallback } from 'react';
import useRagKnowledgeBaseApi from './useRagKnowledgeBaseApi';
import {
  GroundingSource,
  RetrievedChunk,
  buildRetrievalQuery,
  toGroundingSources,
} from '../utils/grounding';

// Grounding is only possible when the stack was deployed with a knowledge base.
// Without one the app is a plain conversation - nothing else changes.
export const documentGroundingEnabled: boolean =
  import.meta.env.VITE_APP_RAG_KNOWLEDGE_BASE_ENABLED === 'true';

const modelRegion: string = import.meta.env.VITE_APP_MODEL_REGION ?? '';

/**
 * Retrieval for the chat. One call per user turn, always, without the user ever
 * asking for it. Failures are swallowed on purpose: a knowledge base that is
 * unreachable degrades the answer, it does not break the conversation.
 */
const useDocumentGrounding = () => {
  const { retrieve } = useRagKnowledgeBaseApi();

  const retrieveSources = useCallback(
    async (
      question: string,
      previousQuestion?: string
    ): Promise<GroundingSource[]> => {
      if (!documentGroundingEnabled) {
        return [];
      }

      const query = buildRetrievalQuery(question, previousQuestion);

      if (query === '') {
        return [];
      }

      try {
        const res = await retrieve(query);
        return toGroundingSources(
          res.data.retrievalResults as RetrievedChunk[] | undefined,
          modelRegion
        );
      } catch (e) {
        console.error('Knowledge base retrieval failed', e);
        return [];
      }
    },
    // retrieve is rebuilt on every render but holds no state, so the callback
    // is kept stable on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return { documentGroundingEnabled, retrieveSources };
};

export default useDocumentGrounding;
