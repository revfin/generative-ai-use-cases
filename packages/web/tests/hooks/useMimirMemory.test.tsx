import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

/**
 * The memory manager's fetch shapes and delete/wipe flows, against the
 * exact response shapes `packages/cdk/lambda/mimirMemory.ts` returns:
 *   GET    /mimir-memory            -> { records: [...] }
 *   DELETE /mimir-memory/{recordId} -> 204
 *   DELETE /mimir-memory            -> { deletedRecords: number }
 *
 * axios is mocked at the module boundary - useHttp.ts creates one instance
 * at import time, so the mock hands back a single shared instance the test
 * can program per-case. Each test gets its own SWR cache (via SWRConfig)
 * so responses from one test never leak into the next.
 */

const { axiosInstance } = vi.hoisted(() => ({
  axiosInstance: {
    interceptors: { request: { use: vi.fn() } },
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('axios', () => ({
  default: {
    create: () => axiosInstance,
  },
}));

const record = (over: Partial<Record<string, unknown>> = {}) => ({
  recordId: 'rec-1',
  namespace: '/mimir/preferences/user-1',
  content: 'Prefers dark mode',
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

const freshCacheWrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    {children}
  </SWRConfig>
);

beforeEach(() => {
  axiosInstance.get.mockReset();
  axiosInstance.delete.mockReset();
});

afterEach(() => {
  vi.resetModules();
});

describe('useMimirMemory', () => {
  it("lists the caller's memory records", async () => {
    axiosInstance.get.mockResolvedValue({
      data: { records: [record()] },
    });

    const useMimirMemory = (await import('../../src/hooks/useMimirMemory'))
      .default;
    const { result } = renderHook(() => useMimirMemory(), {
      wrapper: freshCacheWrapper,
    });

    await waitFor(() => expect(result.current.records).toHaveLength(1));

    expect(axiosInstance.get).toHaveBeenCalledWith('mimir-memory');
    expect(result.current.records[0]).toEqual(record());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  it('deletes a single record by id and refetches', async () => {
    axiosInstance.get
      .mockResolvedValueOnce({ data: { records: [record()] } })
      .mockResolvedValueOnce({ data: { records: [] } });
    axiosInstance.delete.mockResolvedValue({ data: undefined });

    const useMimirMemory = (await import('../../src/hooks/useMimirMemory'))
      .default;
    const { result } = renderHook(() => useMimirMemory(), {
      wrapper: freshCacheWrapper,
    });

    await waitFor(() => expect(result.current.records).toHaveLength(1));

    await act(async () => {
      await result.current.deleteMemory('rec-1');
    });

    expect(axiosInstance.delete).toHaveBeenCalledWith('mimir-memory/rec-1');
    await waitFor(() => expect(result.current.records).toHaveLength(0));
  });

  it('wipes every record and reports how many were deleted', async () => {
    axiosInstance.get
      .mockResolvedValueOnce({
        data: { records: [record(), record({ recordId: 'rec-2' })] },
      })
      .mockResolvedValueOnce({ data: { records: [] } });
    axiosInstance.delete.mockResolvedValue({ data: { deletedRecords: 2 } });

    const useMimirMemory = (await import('../../src/hooks/useMimirMemory'))
      .default;
    const { result } = renderHook(() => useMimirMemory(), {
      wrapper: freshCacheWrapper,
    });

    await waitFor(() => expect(result.current.records).toHaveLength(2));

    let deletedRecords = -1;
    await act(async () => {
      deletedRecords = await result.current.forgetEverything();
    });

    expect(axiosInstance.delete).toHaveBeenCalledWith('mimir-memory');
    expect(deletedRecords).toBe(2);
    await waitFor(() => expect(result.current.records).toHaveLength(0));
  });

  it('surfaces a load error instead of throwing', async () => {
    axiosInstance.get.mockRejectedValue(new Error('network down'));

    const useMimirMemory = (await import('../../src/hooks/useMimirMemory'))
      .default;
    const { result } = renderHook(() => useMimirMemory(), {
      wrapper: freshCacheWrapper,
    });

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.records).toEqual([]);
  });
});
