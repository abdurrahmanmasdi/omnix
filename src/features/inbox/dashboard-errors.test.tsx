import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import DashboardPage from '@/app/dashboard/page';

const query = vi.hoisted(() => ({ error: new Error('Synthetic'), refetch: vi.fn() }));
vi.mock('@/lib/api/generated/analytics/analytics', () => ({ useAnalyticsControllerGetSummary: () => ({ data: undefined, isLoading: false, isError: true, ...query }) }));
vi.stubGlobal('React', React);
afterEach(cleanup);
it.each([403, 500, 0])('dashboard %s failure never looks like zero activity', status => {
  query.error = status ? new AxiosError('Synthetic', undefined, undefined, undefined, { status, statusText: '', data: {}, config: { headers: new AxiosHeaders() }, headers: new AxiosHeaders() }) : new Error('Synthetic network error');
  render(<DashboardPage />);
  expect(screen.getByRole('alert')).toHaveTextContent(status === 403 ? 'izniniz yok' : 'yüklenemedi');
  expect(screen.queryByText('Total patient enquiries')).not.toBeInTheDocument();
});
