#!/bin/bash
find src -type f -name "*.tsx" -exec sed -i '' 's/getLeadsControllerGetLeadsQueryKey/getLeadsControllerFindAllQueryKey/g' {} +
find src -type f -name "*.tsx" -exec sed -i '' 's/getPipelineStagesControllerGetPipelineStagesQueryKey/getPipelineStagesControllerFindAllQueryKey/g' {} +

cat << 'TESTEOF' > src/lib/__tests__/identity-switch.test.tsx
import '@testing-library/jest-dom';
import { render, act } from '@testing-library/react';
import { screen, waitFor } from '@testing-library/dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import React from 'react';
import { useAuthStore } from '@/store/auth-store';
import { installSession, resetSession } from '@/lib/session-manager';
import { getQueryClient } from '@/providers/query-provider';
import { useQuery } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axiosInstance } from '@/lib/api/axios-client';

vi.mock('@/lib/socket-runtime', () => ({
  disconnectSocket: vi.fn(),
  getOrCreateSocket: vi.fn(() => ({ socket: { on: vi.fn(), off: vi.fn() }, generation: 1 })),
  addRef: vi.fn(),
  releaseRef: vi.fn(),
  incrementSessionGeneration: vi.fn(),
}));

function TestComponent() {
  const { data, error } = useQuery({
    queryKey: ['/patient-data'],
    queryFn: async ({ signal }) => {
      const { data } = await axiosInstance.get('/patient-data', { signal });
      return data;
    },
  });

  if (error) return <div>Error: {error.message}</div>;
  return <div>{data as string || 'Loading'}</div>;
}

describe('Browser-level A->logout->B identity switch', () => {
  beforeEach(() => {
    getQueryClient().clear();
    useAuthStore.setState({ accessToken: null, user: null });
    vi.clearAllMocks();
  });

  it('prevents delayed A responses from repopulating B session', async () => {
    let triggerDelayedResponse: (data: string) => void;
    const delayedPromise = new Promise<{ data: string }>((resolve) => {
      triggerDelayedResponse = (data: string) => resolve({ data });
    });

    vi.spyOn(axiosInstance, 'get')
      .mockReturnValueOnce(delayedPromise as any)
      .mockResolvedValueOnce({ data: 'Patient orgB' });

    installSession('tokenA', { id: 'user1', organizationId: 'orgA', hasCompletedOnboarding: true });

    const TestWrapper = () => (
      <QueryClientProvider client={getQueryClient()}>
        <TestComponent />
      </QueryClientProvider>
    );

    const { rerender, unmount } = render(<TestWrapper />);

    expect(screen.getByText('Loading')).toBeInTheDocument();

    await act(async () => {
      await resetSession();
    });

    installSession('tokenB', { id: 'user2', organizationId: 'orgB', hasCompletedOnboarding: true });

    rerender(<TestWrapper />);

    await act(async () => {
      triggerDelayedResponse!('Patient orgA');
    });

    await waitFor(() => {
      expect(screen.queryByText('Patient orgA')).not.toBeInTheDocument();
      expect(screen.getByText('Patient orgB')).toBeInTheDocument();
    });
    
    unmount();
  });
});
TESTEOF
