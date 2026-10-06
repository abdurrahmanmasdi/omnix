import React from "react";
import "@testing-library/jest-dom";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axiosInstance } from "@/lib/api/axios-client";
import type { InboxConversationDto, InboxMessageDto } from "@/lib/api/model";
import { AppLocaleProvider } from "@/i18n/provider";
import { Composer } from "./Composer";
import { ConversationHeader } from "./ConversationHeader";
import { Thread } from "./Thread";
import { ConversationList } from "./ConversationList";
import { ReadError } from "./ReadError";
import { useInboxSocket } from "./hooks";
import { useConversationsControllerGetConversation } from "@/lib/api/generated/conversations/conversations";

const { socket } = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  return { socket: new EventEmitter() };
});
vi.mock("@/hooks/useSocket", () => ({
  useSocket: () => ({ socket, isConnected: true }),
}));
vi.stubGlobal("React", React);
const message: InboxMessageDto = {
  id: "m1",
  conversationId: "conv",
  senderId: null,
  mediaUrl: null,
  content: "Synthetic patient enquiry",
  type: "LEAD_TEXT",
  handledBy: "AI",
  status: "PROCESSED",
  createdAt: "2026-10-03T10:00:00Z",
  updatedAt: "2026-10-03T10:00:00Z",
};
const conversation: InboxConversationDto = {
  id: "conv",
  organizationId: "org",
  leadId: null,
  channelId: null,
  externalContactId: null,
  assignedAgentId: null,
  aiPaused: false,
  stateVersion: 1,
  status: "ACTIVE",
  lead: null,
  messages: [message],
  createdAt: message.createdAt,
  updatedAt: message.updatedAt,
};
const originalAdapter = axiosInstance.defaults.adapter;
let calls: InternalAxiosRequestConfig[];
let current: InboxConversationDto;
let historyStatus: number;
let sendStatus: number;
let sendBody: object;
let requests: (config: InternalAxiosRequestConfig) => unknown;
let client: QueryClient;
function mount(children: React.ReactNode) {
  return render(
    <QueryClientProvider client={client}>
      <AppLocaleProvider>{children}</AppLocaleProvider>
    </QueryClientProvider>,
  );
}
const onUnseen = vi.fn();
function ConnectedThread() {
  useInboxSocket("conv", onUnseen);
  const query = useConversationsControllerGetConversation("conv");
  return query.data ? (
    <>
      <ConversationHeader
        conversation={query.data}
        refreshing={query.isFetching}
        onBack={() => {}}
      />
      <Thread id="conv" />
      <Composer conversation={query.data} refreshing={query.isFetching} />
    </>
  ) : null;
}
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  calls = [];
  current = { ...conversation };
  historyStatus = 200;
  sendStatus = 201;
  sendBody = {
    ...message,
    id: "sent",
    type: "USER_TEXT",
    status: "SENT",
    deliveryStatus: "SENT",
    warnings: [],
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  requests = (config) => {
    if (config.url === "/conversations/conv" && config.method === "get")
      return current;
    if (config.url?.endsWith("/ai-pause")) {
      current = { ...current, aiPaused: true, stateVersion: 2 };
      return { id: "conv", aiPaused: true };
    }
    if (config.url?.endsWith("/ai-resume")) {
      current = { ...current, aiPaused: false, stateVersion: 3 };
      return { id: "conv", aiPaused: false };
    }
    if (config.url?.endsWith("/messages"))
      return config.method === "post"
        ? sendBody
        : { data: [message], hasMore: false, nextCursor: null };
    return [];
  };
  axiosInstance.defaults.adapter = async (config) => {
    calls.push(config);
    const isHistory =
      config.url?.endsWith("/messages") && config.method === "get";
    const status =
      config.url?.endsWith("/messages") && config.method === "post"
        ? sendStatus
        : isHistory
          ? historyStatus
          : 200;
    const response = {
      data: requests(config),
      status,
      statusText: "",
      headers: new AxiosHeaders(),
      config,
    };
    if (status >= 400)
      throw new AxiosError(
        "synthetic failure",
        "ERR_BAD_RESPONSE",
        config,
        undefined,
        response,
      );
    return response;
  };
});
afterEach(() => {
  cleanup();
  client.clear();
  socket.removeAllListeners();
  axiosInstance.defaults.adapter = originalAdapter;
  vi.clearAllMocks();
});

describe("Inbox user flows", () => {
  it("loads current server state, takes over, sends, and confirms resume", async () => {
    mount(<ConnectedThread />);
    const takeOver = await screen.findByRole("button", { name: "Devral" });
    expect(screen.getByRole("textbox", { name: "Mesajınız" })).toBeDisabled();
    fireEvent.click(takeOver);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Mesajınız" })).toBeEnabled(),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Merhaba Çağrı Şahin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gönder" }));
    await waitFor(() =>
      expect(
        calls.some(
          (call) => call.method === "post" && call.url?.endsWith("/messages"),
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(""));
    fireEvent.click(screen.getByRole("button", { name: "AI’ı devam ettir" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(calls.some((call) => call.url?.endsWith("/ai-resume"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /^Devam ettir$/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Devral" })).toBeEnabled(),
    );
  });
  it("uses paused state after reload and reconciles socket updates", async () => {
    current.aiPaused = true;
    mount(<ConnectedThread />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
    current = { ...current, aiPaused: false, stateVersion: 9 };
    await act(async () => {
      socket.emit("onConversationUpdate", { id: "conv", aiPaused: true });
    });
    await waitFor(() => expect(screen.getByRole("textbox")).toBeDisabled());
    expect(screen.getByRole("button", { name: "Devral" })).toBeInTheDocument();
  });
  it("allows staff to send after STOP and shows a non-blocking warning", async () => {
    current.aiPaused = true;
    current.lead = {
      id: "patient",
      firstName: "Çağrı",
      lastName: "Şahin",
      phoneNumber: "***1234",
      email: null,
      primaryLanguage: "tr",
      country: "Türkiye",
      timezone: "Europe/Istanbul",
      status: "HANDED_OFF",
      priority: "WARM",
      assignedAgentId: null,
      assigneeName: null,
      pipelineStageId: null,
      stageName: null,
      summary: null,
      optedOut: true,
    };
    sendBody = { ...sendBody, warnings: ["PATIENT_OPTED_OUT"] };
    mount(<ConnectedThread />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
    expect(
      screen.getByText(/Yine de yanıt verebilirsiniz/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Synthetic staff reply" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gönder" }));
    expect(
      await screen.findByText(/Personel yanıtlarına izin verilir/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
  });
  it.each([
    ["OUTSIDE_24H_WINDOW", "24 saat"],
    ["CHANNEL_UNAVAILABLE", "WhatsApp kanalı"],
    ["NO_CONTACT", "WhatsApp kişisi"],
  ])("shows %s and preserves a failed send", async (code, text) => {
    current.aiPaused = true;
    sendStatus = 422;
    sendBody = { code, message: "Synthetic block" };
    mount(<ConnectedThread />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Keep this text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gönder" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(screen.getByRole("textbox")).toHaveValue("Keep this text");
    await waitFor(() => expect(screen.getByRole("textbox")).toBeDisabled());
  });
  it("does not claim a timed-out staff send was rejected or automatically resend it", async () => {
    current.aiPaused = true;
    const adapter = axiosInstance.defaults.adapter;
    axiosInstance.defaults.adapter = async (config) => {
      if (config.method === "post" && config.url?.endsWith("/messages")) {
        calls.push(config);
        throw new AxiosError("timeout", "ECONNABORTED", config);
      }
      if (typeof adapter !== "function")
        throw new Error("Missing synthetic adapter");
      return adapter(config);
    };
    mount(<ConnectedThread />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Possibly accepted text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gönder" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Yeniden göndermeden önce WhatsApp’ı kontrol edin",
    );
    expect(screen.getByRole("textbox")).toHaveValue("Possibly accepted text");
    expect(
      calls.filter(
        (call) => call.method === "post" && call.url?.endsWith("/messages"),
      ),
    ).toHaveLength(1);
  });
  it.each([403, 500, 0])(
    "renders %s history failure as an error rather than empty",
    async (status) => {
      if (!status)
        axiosInstance.defaults.adapter = () =>
          Promise.reject(new AxiosError("network", "ERR_NETWORK"));
      else historyStatus = status;
      mount(<Thread id="conv" />);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        status === 403 ? "erişiminiz yok" : "yüklenemedi",
      );
      expect(screen.queryByText("Henüz mesaj yok")).not.toBeInTheDocument();
    },
  );
  it("renders a successful empty history", async () => {
    requests = () => ({ data: [], hasMore: false, nextCursor: null });
    mount(<Thread id="conv" />);
    expect(await screen.findByText("Henüz mesaj yok")).toBeInTheDocument();
  });
  it("merges repeated socket messages and delivery receipts", async () => {
    requests = (config) =>
      config.url === "/conversations/conv"
        ? current
        : { data: [message], hasMore: false, nextCursor: null };
    mount(<ConnectedThread />);
    await screen.findByText(message.content);
    const live = {
      ...message,
      id: "live",
      type: "AI_DRAFT",
      content: "Unsent synthetic draft",
    };
    requests = (config) =>
      config.url === "/conversations/conv"
        ? current
        : { data: [live, message], hasMore: false, nextCursor: null };
    await act(async () => {
      socket.emit("onNewMessage", live);
      socket.emit("onNewMessage", live);
    });
    await waitFor(() =>
      expect(screen.getAllByText("Unsent synthetic draft")).toHaveLength(1),
    );
    expect(screen.getByText("AI taslağı — gönderilmedi")).toBeInTheDocument();
  });
  it("loads older cursor history", async () => {
    requests = (config) =>
      config.params?.cursor
        ? {
            data: [
              {
                ...message,
                id: "older",
                content: "Older synthetic message",
                createdAt: "2026-10-02T10:00:00Z",
              },
            ],
            hasMore: false,
            nextCursor: null,
          }
        : { data: [message], hasMore: true, nextCursor: "m1" };
    mount(<Thread id="conv" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Eski mesajları yükle" }),
    );
    expect(
      await screen.findByText("Older synthetic message"),
    ).toBeInTheDocument();
    expect(calls.some((call) => call.params?.cursor === "m1")).toBe(true);
  });
  it("pages the list and applies filters on the server", async () => {
    requests = (config) =>
      config.params?.page === 1
        ? Array.from({ length: 30 }, (_, index) => ({
            ...conversation,
            id: `conv-${index}`,
          }))
        : [{ ...conversation, id: "page-two", lead: null }];
    const props = {
      activeId: null,
      onSelect: vi.fn(),
      unseen: new Set<string>(),
      unreadLeadIds: new Set<string>(),
      unreadConversationIds: new Set<string>(),
    };
    const onFilter = vi.fn();
    mount(<ConversationList {...props} filter="mine" onFilter={onFilter} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Daha fazla görüşme" }),
    );
    await waitFor(() =>
      expect(
        calls.some(
          (call) => call.params?.page === 2 && call.params?.filter === "mine",
        ),
      ).toBe(true),
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "unassigned" },
    });
    expect(onFilter).toHaveBeenCalledWith("unassigned");
  });
  it("renders list empty and error states explicitly", async () => {
    const props = {
      activeId: null,
      onSelect: vi.fn(),
      unseen: new Set<string>(),
      unreadLeadIds: new Set<string>(),
      unreadConversationIds: new Set<string>(),
      onFilter: vi.fn(),
    };
    const view = mount(<ConversationList {...props} filter="all" />);
    expect(
      await screen.findByText("Bu filtrede görüşme yok."),
    ).toBeInTheDocument();
    view.unmount();
    client.clear();
    axiosInstance.defaults.adapter = () =>
      Promise.reject(new AxiosError("network", "ERR_NETWORK"));
    mount(<ConversationList {...props} filter="all" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("yüklenemedi");
    expect(
      screen.queryByText("Bu filtrede görüşme yok."),
    ).not.toBeInTheDocument();
  });
  it("403 copy is explicit", () => {
    const error = new AxiosError("denied", undefined, undefined, undefined, {
      status: 403,
      statusText: "",
      data: {},
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
    });
    mount(<ReadError messages error={error} retry={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("erişiminiz yok");
  });
});
