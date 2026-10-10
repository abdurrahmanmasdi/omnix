import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { AxiosError } from "axios";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { WeeklyReport } from "./WeeklyReport";
import { weeklyFixture } from "./weekly.fixture";
import { messages } from "@/i18n/messages";
import { useAuthStore } from "@/store/auth-store";
const fetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/axios-client", () => ({ customFetch: fetch }));
let client: QueryClient;
const profile = (name = "Synthetic clinic A", org = "clinic-a") => ({
  memberships: [
    { organizationId: org, organizationName: name, status: "ACTIVE" },
  ],
});
const error = (status: number) =>
  new AxiosError("synthetic", undefined, undefined, undefined, {
    status,
    data: { code: status === 422 ? "WEEKLY_REPORT_TOO_LARGE" : undefined },
  } as never);
function setup(locale: "en" | "tr" | "ar" = "en") {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages[locale]}>
        <WeeklyReport />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  useAuthStore.setState({
    user: {
      id: "user-a",
      organizationId: "clinic-a",
      hasCompletedOnboarding: true,
    },
  });
  fetch.mockReset();
  fetch.mockImplementation(async (config: any) =>
    config.url === "/users/me"
      ? profile()
      : weeklyFixture(config.params?.weekStart),
  );
});
afterEach(() => {
  cleanup();
  client?.clear();
});
describe("weekly report", () => {
  it("shows loading and disables print, then valid empty/null/untracked values", async () => {
    let finish: (value: any) => void = () => {};
    fetch.mockImplementation((config: any) =>
      config.url === "/users/me"
        ? Promise.resolve(profile())
        : new Promise((resolve) => {
            finish = resolve;
          }),
    );
    setup();
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(
      screen.getByRole("button", { name: "Print / Save as PDF" }),
    ).toBeDisabled();
    await act(async () => finish(weeklyFixture()));
    expect(
      await screen.findByText("No recorded activity in this period."),
    ).toBeInTheDocument();
    expect(screen.getByText("Not tracked yet")).toBeInTheDocument();
    expect(screen.getAllByText("No replied samples")).toHaveLength(4);
    expect(
      screen.getByRole("button", { name: "Print / Save as PDF" }),
    ).toBeEnabled();
  });
  it.each([403, 422, 500])(
    "renders distinct error %i and retries without false zeros",
    async (status) => {
      fetch.mockImplementation(async (config: any) => {
        if (config.url === "/users/me") return profile();
        throw error(status);
      });
      setup();
      expect(
        await screen.findByText(
          status === 403
            ? "You do not have access to clinic-wide reports."
            : status === 422
              ? "This week exceeds the report size limit. Choose another week."
              : "The weekly report could not be loaded. Retry to get a complete report.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("New lead records")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Print / Save as PDF" }),
      ).toBeDisabled();
      fetch.mockResolvedValue(weeklyFixture());
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
      expect(await screen.findByText("Not tracked yet")).toBeInTheDocument();
    },
  );
  it.each(["en", "tr", "ar"] as const)(
    "renders %s with localized topics, date and RTL",
    async (locale) => {
      const report = weeklyFixture();
      report.topics = [{ id: "price", conversations: 2 }];
      fetch.mockImplementation(async (config: any) =>
        config.url === "/users/me" ? profile() : report,
      );
      const view = setup(locale);
      expect(
        await screen.findByText(messages[locale].WeeklyReport.notTracked),
      ).toBeInTheDocument();
      expect(
        screen.getByText(messages[locale].WeeklyReport.topics.price),
      ).toBeInTheDocument();
      expect(view.container.querySelector("article")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
    },
  );
  it("scopes keys and cancels stale weeks on rapid week switches", async () => {
    const pending = new Map<string, (value: any) => void>();
    fetch.mockImplementation((config: any) =>
      config.url === "/users/me"
        ? Promise.resolve(profile())
        : config.params?.weekStart
          ? new Promise((resolve) =>
              pending.set(config.params.weekStart, resolve),
            )
          : Promise.resolve(weeklyFixture()),
    );
    setup();
    await screen.findByText("Not tracked yet");
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(screen.queryByText("New lead records")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Print / Save as PDF" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    await act(async () =>
      pending.get("2026-09-21")!({
        ...weeklyFixture("2026-09-21"),
        newLeads: 99,
      }),
    );
    expect(screen.queryByText("99")).not.toBeInTheDocument();
    await act(async () =>
      pending.get("2026-09-14")!(weeklyFixture("2026-09-14")),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    await act(async () =>
      pending.get("2026-09-21")!(weeklyFixture("2026-09-21")),
    );
    await screen.findByText("Not tracked yet");
    const keys = client
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(
      keys.every(
        (key) =>
          key[0] === "session" && key[1] === "user-a" && key[2] === "clinic-a",
      ),
    ).toBe(true);
  });
  it("rejects old clinic results even when an old request resolves late", async () => {
    let finish: (value: any) => void = () => {};
    fetch.mockImplementation((config: any) =>
      config.url === "/users/me"
        ? Promise.resolve(profile())
        : new Promise((resolve) => {
            finish = resolve;
          }),
    );
    setup();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const old = finish;
    fetch.mockImplementation(async (config: any) =>
      config.url === "/users/me"
        ? profile("Synthetic clinic B", "clinic-b")
        : { ...weeklyFixture(), newLeads: 7 },
    );
    act(() =>
      useAuthStore.setState({
        user: {
          id: "user-b",
          organizationId: "clinic-b",
          hasCompletedOnboarding: true,
        },
      }),
    );
    await screen.findByText("Synthetic clinic B");
    await screen.findByText("7");
    await act(async () => old({ ...weeklyFixture(), newLeads: 99 }));
    expect(screen.queryByText("99")).not.toBeInTheDocument();
    expect(screen.queryByText("Synthetic clinic A")).not.toBeInTheDocument();
  });
  it("hides stale figures and keeps print disabled after a failed refresh", async () => {
    setup();
    await screen.findByText("Not tracked yet");
    fetch.mockRejectedValue(error(500));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText(
      "The weekly report could not be loaded. Retry to get a complete report.",
    );
    expect(screen.queryByText("New lead records")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Print / Save as PDF" }),
    ).toBeDisabled();
  });
});
