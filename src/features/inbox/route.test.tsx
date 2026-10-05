import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosHeaders } from "axios";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { axiosInstance } from "@/lib/api/axios-client";
import type { InboxConversationDto } from "@/lib/api/model";
import { Inbox } from "./Inbox";
import { LocaleSwitcher } from "@/i18n/LocaleSwitcher";
import { AppLocaleProvider } from "@/i18n/provider";

const route = vi.hoisted(() => ({
  search: "",
  listeners: new Set<() => void>(),
  navigate: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(
      React.useSyncExternalStore(
        (callback) => {
          route.listeners.add(callback);
          return () => {
            route.listeners.delete(callback);
          };
        },
        () => route.search,
        () => route.search,
      ),
    ),
  useRouter: () => ({ push: route.navigate, replace: route.navigate }),
}));
vi.mock("@/hooks/useSocket", () => ({
  useSocket: () => ({ socket: null, isConnected: false }),
}));
vi.stubGlobal("React", React);
const patient = {
  id: "patient",
  firstName: "İpek",
  lastName: "Şahin",
  phoneNumber: "*******1234",
  email: "ip***@example.invalid",
  country: "Türkiye",
  primaryLanguage: "tr",
  timezone: "Europe/Istanbul",
  status: "HANDED_OFF",
  priority: "WARM",
  assignedAgentId: null,
  assigneeName: null,
  pipelineStageId: null,
  stageName: null,
  summary: "Synthetic AI-generated summary",
  optedOut: false,
};
const conversation: InboxConversationDto = {
  id: "beyond-100",
  organizationId: "org",
  leadId: patient.id,
  channelId: null,
  externalContactId: null,
  assignedAgentId: null,
  aiPaused: true,
  stateVersion: 15,
  status: "ACTIVE",
  lead: patient,
  messages: [],
  createdAt: "2026-10-03T10:00:00Z",
  updatedAt: "2026-10-03T10:00:00Z",
};
const originalAdapter = axiosInstance.defaults.adapter;
let client: QueryClient;
const patched: object[] = [];
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  route.search = "";
  route.listeners.clear();
  route.navigate.mockReset();
  patched.length = 0;
  route.navigate.mockImplementation((url: string) => {
    route.search = url.split("?")[1] || "";
    route.listeners.forEach((listener) => listener());
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  axiosInstance.defaults.adapter = async (config) => {
    let data: unknown = [];
    if (config.url === "/conversations") data = [conversation];
    if (config.url === "/conversations/beyond-100") data = conversation;
    if (config.url?.endsWith("/messages"))
      data = { data: [], hasMore: false, nextCursor: null };
    if (config.method === "patch") {
      patched.push(JSON.parse(config.data));
      data = {};
    }
    return {
      data,
      status: 200,
      statusText: "",
      headers: new AxiosHeaders(),
      config,
    };
  };
});
afterEach(() => {
  cleanup();
  client.clear();
  route.listeners.clear();
  axiosInstance.defaults.adapter = originalAdapter;
});
function mount() {
  return render(
    <QueryClientProvider client={client}>
      <AppLocaleProvider>
        <LocaleSwitcher />
        <Inbox />
      </AppLocaleProvider>
    </QueryClientProvider>,
  );
}

it("navigates list → thread → list and exposes mobile patient details", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: /İpek Şahin/ }));
  await screen.findByRole("button", { name: "AI’ı devam ettir" });
  expect(route.navigate).toHaveBeenCalledWith(
    "/dashboard/conversations?conversation=beyond-100",
    { scroll: false },
  );
  const details = screen.getByRole("button", { name: "Hasta bilgileri" });
  expect(details).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(details);
  expect(details).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
  expect(details).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(
    screen.getByRole("button", { name: "Görüşme listesine dön" }),
  );
  expect(await screen.findByText("Bir görüşme seçin.")).toBeInTheDocument();
});
it("opens direct deep links using current detail independent of loaded list rows", async () => {
  route.search = "conversation=beyond-100";
  mount();
  expect(
    await screen.findByRole("button", { name: "AI’ı devam ettir" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Mesajınız" })).toBeEnabled();
});
it("resolves a handoff lead link through the backend", async () => {
  route.search = "lead=patient";
  mount();
  await waitFor(() =>
    expect(route.navigate).toHaveBeenCalledWith(
      "/dashboard/conversations?conversation=beyond-100",
      { scroll: false },
    ),
  );
});
it("patches a patient name without masked phone/email or untouched fields", async () => {
  route.search = "conversation=beyond-100";
  mount();
  const firstName = await screen.findByRole("textbox", { name: "Ad" });
  expect(screen.getByRole("textbox", { name: "Telefon" })).toBeDisabled();
  fireEvent.change(firstName, { target: { value: "Çağrı" } });
  fireEvent.click(
    screen.getByRole("button", { name: "Değişiklikleri kaydet" }),
  );
  await waitFor(() => expect(patched).toEqual([{ firstName: "Çağrı" }]));
});
it("switches the visible Inbox and lang attribute from Turkish to English", async () => {
  mount();
  await screen.findByRole("button", { name: /İpek Şahin/ });
  expect(document.documentElement.lang).toBe("tr");
  fireEvent.change(screen.getByRole("combobox", { name: "Arayüz dili" }), {
    target: { value: "en" },
  });
  expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
  expect(document.documentElement.lang).toBe("en");
});

it("uses Arabic across Inbox and document direction with only one switch", async () => {
  mount();
  await screen.findByRole("button", { name: /İpek Şahin/ });
  fireEvent.change(screen.getByRole("combobox", { name: "Arayüz dili" }), {
    target: { value: "ar" },
  });
  expect(
    screen.getByRole("heading", { name: "صندوق الوارد" }),
  ).toBeInTheDocument();
  expect(document.documentElement).toHaveAttribute("dir", "rtl");
  expect(
    screen.getByRole("combobox", { name: "لغة الواجهة" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("combobox", { name: "اللغة" }),
  ).not.toBeInTheDocument();
});
