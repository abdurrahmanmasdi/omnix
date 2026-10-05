import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosHeaders } from "axios";
import { afterEach, expect, it, vi } from "vitest";
import { axiosInstance } from "@/lib/api/axios-client";
import contractFixtures from "@/lib/contracts/socket-events.v1.fixtures.json";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { AppLocaleProvider } from "@/i18n/provider";
import type { NotificationInvalidationPayload } from "@/lib/contracts/socket-events.generated";

const mocks = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  return {
    socket: new EventEmitter(),
    push: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  };
});
vi.mock("@/hooks/useSocket", () => ({
  useSocket: () => ({ socket: mocks.socket, isConnected: true }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({
  toast: { warning: mocks.warning, info: mocks.info },
}));
vi.stubGlobal("React", React);
const originalAdapter = axiosInstance.defaults.adapter;
afterEach(() => {
  cleanup();
  mocks.socket.removeAllListeners();
  vi.clearAllMocks();
  axiosInstance.defaults.adapter = originalAdapter;
});

it("generic UPDATE loads the handoff kind over HTTP, updates unread badge and links to its conversation", async () => {
  let unread = 0;
  const payload: NotificationInvalidationPayload = {
    ...contractFixtures.notification,
    type: "UPDATE",
    title: "New notification",
    body: "Open notifications to view details.",
  };
  expect(payload).toEqual(contractFixtures.notification);
  const notification = {
    id: payload.id,
    type: "LEAD_HANDED_OFF",
    title: "Synthetic handoff",
    body: "Synthetic coordinator review",
    referenceType: "CONVERSATION",
    referenceId: "conv",
    isRead: false,
  };
  axiosInstance.defaults.adapter = async (config) => ({
    data: config.url?.endsWith("unread-count")
      ? unread
      : unread
        ? [notification]
        : [],
    status: 200,
    statusText: "",
    headers: new AxiosHeaders(),
    config,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AppLocaleProvider>
        <NotificationBell />
      </AppLocaleProvider>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(mocks.socket.listenerCount("new_notification")).toBe(1),
  );
  unread = 1;
  await act(async () => {
    mocks.socket.emit("new_notification", payload);
  });
  await waitFor(() =>
    expect(mocks.warning).toHaveBeenCalledWith(
      "Synthetic handoff",
      expect.objectContaining({
        description: notification.body,
        action: expect.objectContaining({ label: "Görüşmeyi aç" }),
      }),
    ),
  );
  expect(screen.getByRole("button", { name: "Bildirimler" })).toHaveTextContent(
    "1",
  );
  const options = mocks.warning.mock.calls[0][1];
  options.action.onClick();
  expect(mocks.push).toHaveBeenCalledWith(
    "/dashboard/conversations?conversation=conv",
  );
  await act(async () => {
    mocks.socket.emit("new_notification", payload);
  });
  expect(mocks.warning).toHaveBeenCalledTimes(1);
  client.clear();
});
