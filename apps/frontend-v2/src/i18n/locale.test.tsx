import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosHeaders } from "axios";
import { axiosInstance } from "@/lib/api/axios-client";
import { useAuthStore } from "@/store/auth-store";
import { useCopy } from "./copy";
import { useBackendError, useNotificationText } from "./backend";
import { messages } from "./messages";
import { resolveLocale } from "./locale";
import { AppLocaleProvider } from "./provider";
import { LocaleSwitcher } from "./LocaleSwitcher";
vi.stubGlobal("React", React);
const originalAdapter = axiosInstance.defaults.adapter;
afterEach(() => {
  cleanup();
  axiosInstance.defaults.adapter = originalAdapter;
  useAuthStore.getState().logout();
});
function keys(object: object, prefix = ""): string[] {
  return Object.entries(object)
    .flatMap(([key, value]) =>
      typeof value === "object"
        ? keys(value, prefix + key + ".")
        : [prefix + key],
    )
    .sort();
}
describe("shared locale", () => {
  it("keeps identical message keys in all three languages", () => {
    expect(keys(messages.tr)).toEqual(keys(messages.en));
    expect(keys(messages.ar)).toEqual(keys(messages.en));
  });
  it("resolves saved → cookie → browser by quality → Turkish", () => {
    expect(resolveLocale("AR", "en", "tr")).toBe("ar");
    expect(resolveLocale(null, "en", "ar")).toBe("en");
    expect(resolveLocale(null, "bad", "fr, en-US;q=0.4, ar;q=0.9")).toBe("ar");
    expect(resolveLocale(null, null, "en;q=0, de")).toBe("tr");
    expect(resolveLocale()).toBe("tr");
  });
  function Probe() {
    const copy = useCopy();
    const error = useBackendError();
    const notification = useNotificationText();
    return (
      <>
        <span>{copy("Settings")}</span>
        <span>
          {error(
            { response: { data: { code: "HTTP_403", message: "Denied" } } },
            "Fallback",
          )}
        </span>
        <span>
          {notification(
            {
              code: "NEW_MESSAGE",
              params: { name: "Synthetic", preview: "Hello" },
            },
            "title",
          )}
        </span>
        <span>{notification({ title: "Legacy text" }, "title")}</span>
      </>
    );
  }
  it("changes labels, codes, html and cookie without logging out", async () => {
    useAuthStore.getState().setAuth("synthetic-test-access", {
      id: "self",
      organizationId: "org",
      hasCompletedOnboarding: true,
      locale: "EN",
    });
    const requests: unknown[] = [];
    axiosInstance.defaults.adapter = async (config) => {
      requests.push(JSON.parse(config.data));
      return {
        data: { locale: "AR" },
        status: 200,
        statusText: "",
        headers: new AxiosHeaders(),
        config,
      };
    };
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <AppLocaleProvider initialLocale="tr">
          <LocaleSwitcher />
          <Probe />
        </AppLocaleProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText("Settings")).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Interface language" }),
      { target: { value: "ar" } },
    );
    await screen.findByText("الإعدادات");
    expect(screen.getByText("ليس لديك إذن لهذا الإجراء.")).toBeInTheDocument();
    expect(screen.getByText("رسالة جديدة من Synthetic")).toBeInTheDocument();
    expect(screen.getByText("Legacy text")).toBeInTheDocument();
    expect(requests).toEqual([{ locale: "AR" }]);
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(document.cookie).toContain("NEXT_LOCALE=ar");
    expect(useAuthStore.getState().accessToken).toBe("synthetic-test-access");
    client.clear();
  });
  it("keeps the current locale if saving fails", async () => {
    useAuthStore.getState().setAuth("synthetic-test-access", {
      id: "self",
      organizationId: "org",
      hasCompletedOnboarding: true,
      locale: "EN",
    });
    axiosInstance.defaults.adapter = async () => {
      throw new Error("Synthetic failure");
    };
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AppLocaleProvider>
          <LocaleSwitcher />
          <Probe />
        </AppLocaleProvider>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ar" } });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not save language",
      ),
    );
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(useAuthStore.getState().user?.locale).toBe("EN");
    client.clear();
  });
});
