import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MimirMemoryPanel from '../../src/components/MimirMemoryPanel';
import { MimirMemoryRecord } from '../../src/hooks/useMimirMemory';

/**
 * The panel's delete/wipe confirm flows - `useMimirMemory` is mocked so the
 * test is about the UI contract (grouping, inline confirm, the "forget
 * everything" dialog and its count toast), not the network.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const deleteMemory = vi.fn();
const forgetEverything = vi.fn();
let mockRecords: MimirMemoryRecord[] = [];
let mockLoading = false;
let mockError: unknown;

vi.mock('../../src/hooks/useMimirMemory', () => ({
  default: () => ({
    records: mockRecords,
    loading: mockLoading,
    error: mockError,
    deleteMemory,
    forgetEverything,
  }),
  __esModule: true,
}));

const record = (over: Partial<MimirMemoryRecord> = {}): MimirMemoryRecord => ({
  recordId: 'rec-1',
  namespace: '/mimir/preferences/user-1',
  content: 'Prefers dark mode',
  createdAt: new Date().toISOString(),
  ...over,
});

// jsdom has no ResizeObserver; @headlessui/react's Dialog needs one.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  mockRecords = [];
  mockLoading = false;
  mockError = undefined;
  deleteMemory.mockReset().mockResolvedValue(undefined);
  forgetEverything.mockReset().mockResolvedValue(0);
  toastSuccess.mockClear();
  toastError.mockClear();
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('MimirMemoryPanel', () => {
  it('shows the calm empty state when nothing is remembered', () => {
    render(<MimirMemoryPanel />);
    expect(screen.getByText('memory.empty')).toBeInTheDocument();
    expect(screen.queryByText('memory.preferences')).toBeNull();
  });

  it('shows a loading state', () => {
    mockLoading = true;
    render(<MimirMemoryPanel />);
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('shows a load error', () => {
    mockError = new Error('boom');
    render(<MimirMemoryPanel />);
    expect(screen.getByText('memory.load_failed')).toBeInTheDocument();
  });

  it('groups records into Preferences and Facts', () => {
    mockRecords = [
      record({
        recordId: 'p-1',
        namespace: '/mimir/preferences/user-1',
        content: 'Likes dark mode',
      }),
      record({
        recordId: 'f-1',
        namespace: '/mimir/facts/user-1',
        content: 'Owns an EV',
      }),
    ];

    render(<MimirMemoryPanel />);

    expect(screen.getByText('memory.preferences')).toBeInTheDocument();
    expect(screen.getByText('Likes dark mode')).toBeInTheDocument();
    expect(screen.getByText('memory.facts')).toBeInTheDocument();
    expect(screen.getByText('Owns an EV')).toBeInTheDocument();
  });

  it('deletes a memory only after the inline confirm is clicked', async () => {
    mockRecords = [record()];
    render(<MimirMemoryPanel />);

    fireEvent.click(screen.getByLabelText('common.delete'));
    expect(deleteMemory).not.toHaveBeenCalled();

    // Inline confirm now shows Confirm (common.delete) / Cancel (common.cancel)
    const [confirmButton] = screen.getAllByLabelText('common.delete');
    fireEvent.click(confirmButton);

    await waitFor(() => expect(deleteMemory).toHaveBeenCalledWith('rec-1'));
  });

  it('cancelling the inline confirm leaves the memory alone', () => {
    mockRecords = [record()];
    render(<MimirMemoryPanel />);

    fireEvent.click(screen.getByLabelText('common.delete'));
    fireEvent.click(screen.getByLabelText('common.cancel'));

    expect(deleteMemory).not.toHaveBeenCalled();
    // Back to a plain delete affordance, not the confirm row
    expect(screen.getByLabelText('common.delete')).toBeInTheDocument();
  });

  it('forgets everything only after the explicit confirm dialog, then reports the count', async () => {
    mockRecords = [record(), record({ recordId: 'rec-2' })];
    forgetEverything.mockResolvedValue(2);

    render(<MimirMemoryPanel />);

    fireEvent.click(screen.getByText('memory.forget_all_button'));
    expect(forgetEverything).not.toHaveBeenCalled();

    // Dialog is open; confirm via the destructive button inside it
    const confirmButtons = screen.getAllByText('memory.forget_all_button');
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(forgetEverything).toHaveBeenCalled());
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        'memory.forget_all_success:{"count":2}'
      )
    );
  });

  it('shows an error toast when forgetting everything fails', async () => {
    mockRecords = [record()];
    forgetEverything.mockRejectedValue(new Error('nope'));

    render(<MimirMemoryPanel />);

    fireEvent.click(screen.getByText('memory.forget_all_button'));
    const confirmButtons = screen.getAllByText('memory.forget_all_button');
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('memory.forget_all_failed')
    );
  });
});
