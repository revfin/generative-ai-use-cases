import { create } from 'zustand';

/** A document a citation points at, as far as the panel needs to know. */
export type PreviewDoc = {
  /** The unsigned S3 URL, anchor included, exactly as the citation wrote it. */
  href: string;
  label: string;
  page?: number;
};

type DocumentPreviewState = {
  doc: PreviewDoc | null;
  /**
   * How many panels are mounted. Citations live in shared components that are
   * also rendered on pages without a panel (shared conversations, agent chats);
   * there they must keep their old open-in-a-new-tab behaviour instead of
   * pushing state nobody is listening to.
   */
  hosts: number;
  openPreview: (doc: PreviewDoc) => void;
  closePreview: () => void;
  addHost: () => void;
  removeHost: () => void;
};

/**
 * One panel per page, one store for the whole app. A zustand store rather than
 * component state because the click that opens the panel happens deep inside a
 * react-markdown component map, several layers below the page.
 */
const useDocumentPreview = create<DocumentPreviewState>((set) => ({
  doc: null,
  hosts: 0,
  openPreview: (doc) =>
    set((state) => (state.doc?.href === doc.href ? state : { doc })),
  closePreview: () =>
    set((state) => (state.doc === null ? state : { doc: null })),
  addHost: () => set((state) => ({ hosts: state.hosts + 1 })),
  // The panel unmounts with the page, and a stale document must not reopen on
  // the next one
  removeHost: () =>
    set((state) => {
      const hosts = Math.max(0, state.hosts - 1);
      return hosts === 0 ? { hosts, doc: null } : { hosts };
    }),
}));

export default useDocumentPreview;
