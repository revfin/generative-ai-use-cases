import { useCallback, useState } from 'react';
import useFileApi from './useFileApi';
import { S3Type } from 'generative-ai-use-cases';

const S3_URL = /^https:\/\/(|[\w\\-]+\.)s3(|(\.|-)[\w\\-]+).amazonaws.com\//;

/** Whether a citation href points at a document in S3. */
export const isS3Url = (url: string): boolean => S3_URL.test(url);

const useRagFile = () => {
  const { getFileDownloadSignedUrl } = useFileApi();
  const [downloading, setDownloading] = useState(false);

  /**
   * The single presign path for citations. `getFileDownloadSignedUrl` splits
   * the `#page=N` anchor off before signing and puts it back on the signed URL,
   * so the result is safe to hand to an iframe, an <img>, or fetch().
   *
   * Signed URLs are short lived, so callers resolve on open rather than caching.
   */
  const resolveDocUrl = useCallback(
    (url: string, s3Type?: S3Type): Promise<string> =>
      getFileDownloadSignedUrl(url, s3Type),
    // useFileApi rebuilds its object on every render but holds no state, so the
    // callback is kept stable on purpose - effects depend on it
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const downloadDoc = useCallback(
    async (url: string, s3Type?: S3Type) => {
      setDownloading(true);

      try {
        const signedUrl = await resolveDocUrl(url, s3Type);
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
      } catch (e) {
        console.error(e);
      } finally {
        setDownloading(false);
      }
    },
    [resolveDocUrl]
  );

  return {
    isS3Url,
    resolveDocUrl,
    downloadDoc,
    downloading,
  };
};

export default useRagFile;
